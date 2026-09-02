import { Link, useParams } from "react-router";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";

const SOLUTIONS = {
  sales: {
    title: "FIND THE LEAD. MAKE THE CALL. BOOK THE NEXT STEP.",
    description:
      "Find leads through a connected source or bring a list. Your Sales Bot calls, qualifies, books, follows up, and records the outcome.",
    primary: { href: "/signup?wedge=sales", label: "Get Your Sales Bot" },
    secondary: { href: "/features", label: "See How It Works" },
    sequence: [
      [
        "Find or Bring the Leads",
        "Lead Hunt surfaces prospects from a connected source, or you import an approved list.",
      ],
      ["Review. Then Queue.", "Approve the contacts, playbook, and calling window."],
      ["Your Bot Calls and Books", "Qualified, booked, handed off, or logged with context."],
    ],
    capabilities: [
      [
        "Your Playbook in Every Call",
        "Use your positioning, tone, qualification rules, and approved claims.",
      ],
      [
        "Follow-Up Across Channels",
        "Continue by text or email without restarting the conversation.",
      ],
      [
        "Calendar-Aware Booking",
        "Offer real availability and write the confirmed next step back to the record.",
      ],
    ],
    proof: "Your Bot works the approved queue. Your team takes the next steps.",
  },
  support: {
    title: "A FRONT DESK THAT ANSWERS BEFORE DEMAND GOES COLD",
    description:
      "Give a trained Front Desk Bot your policies, calendar, and handoff rules. It answers calls, holds natural conversations, continues by text and email, then resolves or routes the next step.",
    primary: {
      href: "/signup?wedge=support",
      label: "Create Front Desk Bot",
    },
    secondary: { href: "/features", label: "See How It Works" },
    sequence: [
      [
        "A Customer Reaches Out",
        "A Conversation Bot answers by call, text, or email with the same identity and context.",
      ],
      [
        "It Uses Your Approved Truth",
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

  return (
    <MarketingPageFrame className="wl-solutions-page" stickyCta>
      <PageMeta
        title={`${page.title} | BotBound`}
        description={page.description}
        path={`/solutions/${key}`}
      />

      <section className="marketing-section marketing-section--screen">
        <div className="mx-auto mb-8 max-w-6xl text-center">
          <p className="wl-eyebrow wl-eyebrow--wired text-primary">
            {key === "sales" ? "Outbound" : "Inbound"}
          </p>
          <h1 className="marketing-hero-title mx-auto mt-4 max-w-[22ch] text-[clamp(1.9rem,3.4vw,2.9rem)]">
            {page.title}
          </h1>
          <div className="marketing-hero__actions mt-7">
            <Link
              to={page.primary.href}
              className="marketing-btn-primary min-h-11 px-5 text-sm font-semibold"
            >
              {page.primary.label}
            </Link>
            <Link
              to={page.secondary.href}
              className="marketing-btn-secondary min-h-11 px-5 text-sm font-semibold"
            >
              {page.secondary.label}
            </Link>
          </div>
        </div>
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
