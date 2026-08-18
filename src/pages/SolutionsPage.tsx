import { useParams } from "react-router";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import MarketingHero from "../components/marketing/MarketingHero";
import { WIRELINE_DEMO_AGENTS } from "../data/contact-agents";

const SOLUTIONS = {
  sales: {
    title: "Every Good Lead Gets a Next Step",
    description:
      "Give a trained voice agent your offer, qualification rules, calendar, and follow up. It calls, texts, and emails until the next step is booked or clearly logged.",
    primary: { href: "/signup?wedge=sales", label: "Create Sales Agent" },
    secondary: { href: "/showcase", label: "Hear a Demo" },
    sequence: [
      ["A Lead Reaches Out", "A voice agent responds on the channel the lead already chose."],
      [
        "It Qualifies by Your Rules",
        "Your offer, criteria, objections, and escalation path guide the conversation.",
      ],
      ["The Next Step Is Clear", "Booked, handed off, or logged with the full context attached."],
    ],
    capabilities: [
      [
        "Your Offer in Every Call",
        "Use your positioning, tone, qualification rules, and approved claims.",
      ],
      [
        "Follow Up Across Channels",
        "Continue by SMS or email without restarting the conversation.",
      ],
      [
        "Calendar Aware Booking",
        "Offer real availability and write the confirmed next step back to the record.",
      ],
    ],
    proof:
      "More qualified conversations move forward. Your team spends time where judgment closes the deal.",
  },
  support: {
    title: "A Front Desk That Answers Before Demand Goes Cold",
    description:
      "Give a trained voice agent your policies, calendar, and handoff rules. It answers calls, texts, and email, then resolves or routes the next step.",
    // Wedge intent only — preselecting the $79 5-agent Pro plan for a
    // one-agent front-desk buyer mis-tuned the later "Matched from visit"
    // badge in billing; the sales wedge passes intent the same way.
    primary: {
      href: "/signup?wedge=support",
      label: "Create Front Desk Agent",
    },
    secondary: { href: "/showcase", label: "Hear a Demo" },
    sequence: [
      [
        "A Customer Reaches Out",
        "A voice agent answers on call, text, or email with the same identity.",
      ],
      [
        "It Uses Your Business Truth",
        "Policies, services, availability, and escalation rules stay consistent.",
      ],
      [
        "It Resolves or Hands Off Cleanly",
        "The right person receives the request with context already attached.",
      ],
    ],
    capabilities: [
      [
        "Your Voice and Playbook",
        "Carry your tone, policies, service knowledge, and approved answers.",
      ],
      [
        "Booking That Closes the Loop",
        "Schedule, confirm, and continue the conversation across email and text.",
      ],
      [
        "Escalation with Context",
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
    <MarketingPageFrame className="wl-solutions-page">
      <PageMeta
        title={`${page.title} | Wireline`}
        description={page.description}
        path={`/solutions/${key}`}
      />

      <section className="marketing-section marketing-section--screen">
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
              <BrowserCallWidget
                agentName={demoAgentName}
                fallback={
                  demoAgent ? (
                    <div className="text-center">
                      <a
                        href={`tel:${demoAgent.tel}`}
                        className="marketing-btn-secondary inline-flex min-h-11 justify-center px-5 text-[15px] font-semibold"
                      >
                        Call the {key === "sales" ? "Sales" : "Support"} Demo
                      </a>
                      <p className="mt-2 font-mono text-xs text-muted-foreground">
                        {demoAgent.tel}
                      </p>
                    </div>
                  ) : undefined
                }
              />
            </div>
          }
        />
      </section>

      <section className="marketing-section marketing-section--screen">
        <ol className="grid gap-3 sm:grid-cols-3">
          {page.sequence.map(([title, copy], index) => (
            <li key={title} className="wl-stitch-card px-4 py-5 text-center">
              <span className="flex items-center justify-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[color:var(--wireline-color-action-primary-container)] font-mono text-[10px] font-semibold text-primary">
                  0{index + 1}
                </span>
                <h3 className="wl-card-title">{title}</h3>
              </span>
              <p className="mx-auto mt-2 max-w-[36ch] text-[13px] leading-[1.5] text-muted-foreground">
                {copy}
              </p>
            </li>
          ))}
        </ol>

        <ul className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {page.capabilities.map(([title, copy]) => (
            <li
              key={title}
              className="wl-channel-chip inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground"
            >
              {title}
              <span className="sr-only">{copy}</span>
            </li>
          ))}
        </ul>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-6 text-muted-foreground">
          {page.proof}
        </p>
      </section>
    </MarketingPageFrame>
  );
}
