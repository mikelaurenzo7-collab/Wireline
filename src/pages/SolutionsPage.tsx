import { Link, useParams } from "react-router";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";

const SOLUTIONS = {
  sales: {
    title: "Set Up a Sales Bot for Lead Follow-Up",
    description:
      "Find leads through a connected source or bring a list. Give your Sales Bot a playbook to call, qualify, book, and follow up while keeping every outcome in one place.",
    primary: { href: "/signup?wedge=sales", label: "Create Your Sales Bot" },
    secondary: { href: "/features", label: "See How It Works" },
    sequence: [
      [
        "Find or Bring the Leads",
        "Lead Hunt surfaces prospects from a connected source, or you import an approved list.",
      ],
      [
        "Set the Playbook",
        "Choose who to contact, what to say, and how your Bot should qualify and book.",
      ],
      [
        "Call. Book. Follow Up.",
        "Your Bot works through the call, records the outcome, and keeps the next step moving.",
      ],
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
    proof: "One Bot finds leads, makes calls, books next steps, and keeps follow-up moving.",
  },
  support: {
    title: "A Front Desk That Answers Before Demand Goes Cold",
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
  const key = (Object.hasOwn(SOLUTIONS, wedge) ? wedge : "support") as SolutionKey;
  const page = SOLUTIONS[key];

  return (
    <MarketingPageFrame className="wl-solutions-page" stickyCta stickyCtaHref={page.primary.href}>
      <PageMeta
        title={`${page.title} | BotBound`}
        description={page.description}
        path={`/solutions/${key}`}
      />

      <section className="marketing-section marketing-section--screen">
        <div className="wl-public-rail">
          <div className="mx-auto mb-8 max-w-6xl text-center">
            <p className="wl-eyebrow wl-eyebrow--wired text-primary">
              {key === "sales" ? "Outbound" : "Inbound"}
            </p>
            <h1 className="marketing-hero-title mx-auto mt-4 text-[clamp(1.9rem,3.4vw,2.9rem)]">
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
          <ol className="grid gap-3 sm:grid-cols-3">
            {page.sequence.map(([title, copy], index) => (
              <li key={title} className="wl-stitch-card px-4 py-5 text-center">
                <span className="flex items-center justify-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-[color:var(--wireline-color-action-primary-container)] font-mono text-[10px] font-semibold text-primary">
                    0{index + 1}
                  </span>
                  <h2 className="wl-card-title">{title}</h2>
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
        </div>
      </section>
    </MarketingPageFrame>
  );
}
