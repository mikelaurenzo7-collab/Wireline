import { Link, useParams } from "react-router";
import {
  ArrowRight,
  CalendarClock,
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
import { WIRELINE_DEMO_AGENTS } from "../data/contact-agents";

const SOLUTIONS = {
  sales: {
    eyebrow: "Sales conversations",
    title: "Every good lead gets a next step.",
    description:
      "Give a trained voice agent your offer, qualification rules, calendar, and follow up. It calls, texts, and emails until the next step is booked or clearly logged.",
    icon: PhoneOutgoing,
    primary: { href: "/signup?wedge=sales", label: "Create a sales agent" },
    secondary: { href: "/showcase", label: "Hear a Demo" },
    sequence: [
      ["A lead reaches out", "A voice agent responds on the channel the lead already chose."],
      [
        "It qualifies by your rules",
        "Your offer, criteria, objections, and escalation path guide the conversation.",
      ],
      ["The next step is clear", "Booked, handed off, or logged with the full context attached."],
    ],
    capabilities: [
      [
        "Your offer in every call",
        "Use your positioning, tone, qualification rules, and approved claims.",
      ],
      [
        "Follow up across channels",
        "Continue by SMS or email without restarting the conversation.",
      ],
      [
        "Calendar aware booking",
        "Offer real availability and write the confirmed next step back to the record.",
      ],
    ],
    proof:
      "More qualified conversations move forward. Your team spends time where judgment closes the deal.",
  },
  support: {
    eyebrow: "Customer coverage",
    title: "A front desk that answers before demand goes cold.",
    description:
      "Give a trained voice agent your policies, calendar, and handoff rules. It answers calls, texts, and email, then resolves or routes the next step.",
    icon: Headphones,
    // Wedge intent only — preselecting the $79 5-agent Pro plan for a
    // one-agent front-desk buyer mis-tuned the later "Matched from visit"
    // badge in billing; the sales wedge passes intent the same way.
    primary: {
      href: "/signup?wedge=support",
      label: "Create a front desk agent",
    },
    secondary: { href: "/showcase", label: "Hear a Demo" },
    sequence: [
      [
        "A customer reaches out",
        "A voice agent answers on call, text, or email with the same identity.",
      ],
      [
        "It uses your business truth",
        "Policies, services, availability, and escalation rules stay consistent.",
      ],
      [
        "It resolves or hands off cleanly",
        "The right person receives the request with context already attached.",
      ],
    ],
    capabilities: [
      [
        "Your voice and playbook",
        "Carry your tone, policies, service knowledge, and approved answers.",
      ],
      [
        "Booking that closes the loop",
        "Schedule, confirm, and continue the conversation across email and text.",
      ],
      [
        "Escalation with context",
        "Route exceptions with the customer, history, and requested outcome intact.",
      ],
    ],
    proof: "Customers get an answer sooner. Your team joins only when its judgment matters.",
  },
} as const;

type SolutionKey = keyof typeof SOLUTIONS;

export default function SolutionsPage() {
  const { wedge = "support" } = useParams<{ wedge: string }>();
  const key = (wedge in SOLUTIONS ? wedge : "support") as SolutionKey;
  const page = SOLUTIONS[key];
  const demoAgentName = key === "sales" ? "Jake" : "Jordan";
  const demoAgent = WIRELINE_DEMO_AGENTS.find((agent) => agent.name === demoAgentName);

  return (
    <MarketingPageFrame>
      <PageMeta
        title={`${page.title} | Wireline`}
        description={page.description}
        path={`/solutions/${key}`}
      />

      <MarketingHero
        title={page.title}
        primaryAction={{ to: page.primary.href, label: page.primary.label }}
        secondaryAction={{
          to: page.secondary.href,
          label: page.secondary.label,
          tone: "secondary",
        }}
        visual={
          <div className="text-center">
            <div className="rounded-[16px] border border-border bg-background/70 p-4">
              <BrowserCallWidget
                agentName={demoAgentName}
                fallback={
                  demoAgent ? (
                    <div className="text-center">
                      <a
                        href={`tel:${demoAgent.tel}`}
                        className="marketing-btn-secondary inline-flex min-h-11 justify-center px-5 text-[15px] font-semibold"
                      >
                        Call the {key === "sales" ? "sales" : "support"} demo
                      </a>
                      <p className="mt-2 font-mono text-xs text-muted-foreground">
                        {demoAgent.tel}
                      </p>
                    </div>
                  ) : undefined
                }
              />
            </div>
          </div>
        }
      />

      <section className="marketing-section wl-public-rail mx-auto">
        <div className="wl-marketing-center mx-auto max-w-2xl">
          <h2 className="wl-stitch-display text-balance">From contact to next step.</h2>
        </div>
        <ol className="mt-10 grid gap-4 lg:grid-cols-3">
          {page.sequence.map(([title, copy], index) => (
            <li key={title} className="wl-stitch-card relative p-6 text-center sm:p-7">
              <span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-[color:var(--wireline-color-action-primary-container)] font-mono text-[length:var(--wireline-typography-caption-size)] font-semibold text-primary">
                0{index + 1}
              </span>
              <h3 className="wl-card-title mx-auto mt-5 min-h-[2.24em] max-w-[18ch]">{title}</h3>
              <p className="mx-auto mt-3 max-w-[34ch] text-[length:var(--wireline-typography-caption-size)] leading-6 text-muted-foreground">
                {copy}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="marketing-section border-t border-border bg-card">
        <div className="wl-public-rail mx-auto">
          <div className="wl-marketing-center mx-auto max-w-3xl">
            <h2 className="wl-stitch-display text-balance">What it handles.</h2>
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-3">
            {page.capabilities.map(([title, copy], index) => {
              const CapabilityIcon = [MessageSquareText, CalendarClock, ShieldCheck][
                index
              ] as LucideIcon;
              return (
                <article
                  key={title}
                  className="wl-stitch-card bg-background p-5 text-center sm:p-6"
                >
                  <CapabilityIcon size={18} className="mx-auto text-primary" aria-hidden="true" />
                  <h3 className="wl-card-title mx-auto mt-4 max-w-[18ch]">{title}</h3>
                  <p className="mx-auto mt-2 max-w-[34ch] text-[length:var(--wireline-typography-caption-size)] leading-6 text-muted-foreground">
                    {copy}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="marketing-section wl-public-rail mx-auto">
        <div className="wl-stitch-card wl-stitch-card-tinted wl-marketing-center grid justify-items-center gap-6 p-6 sm:p-8">
          <div className="max-w-2xl">
            <p className="text-[clamp(1.35rem,1.1rem+1vw,1.85rem)] font-semibold leading-[1.15] tracking-[-.035em] text-foreground">
              {page.proof}
            </p>
          </div>
          <Link
            to={page.primary.href}
            className="marketing-btn-primary min-h-12 shrink-0 px-6 text-[length:var(--wireline-typography-caption-size)] font-semibold"
          >
            Build this agent <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
