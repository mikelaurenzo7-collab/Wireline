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

const SOLUTIONS = {
  sales: {
    eyebrow: "Sales conversations",
    title: "Every qualified lead gets a next step.",
    description:
      "Build custom voice agents that qualify leads on calls, email, and text using your exact knowledge and sales process.",
    icon: PhoneOutgoing,
    primary: { href: "/signup?posture=business", label: "Create a sales agent" },
    secondary: { href: "/showcase", label: "Hear a demo" },
    sequence: [
      ["A lead reaches out", "Custom voice agent answers on phone, email or text."],
      [
        "It qualifies using your playbook",
        "Specialized knowledge, your voice, your exact criteria.",
      ],
      ["Clear next step delivered", "Booked. Handed off. Or logged exactly as configured."],
    ],
    capabilities: [
      [
        "Custom voice on every call",
        "Agents trained on your scripts, tone, and qualification criteria.",
      ],
      [
        "Multi-channel follow-up",
        "Voice agents that continue the conversation via email and text.",
      ],
      [
        "Your calendar, your availability",
        "Book real appointments without double-booking or overpromising.",
      ],
    ],
    proof: "Your team spends time with qualified people. Not a pile of unanswered inquiries.",
  },
  support: {
    eyebrow: "Customer coverage",
    title: "A front desk that is ready when customers are.",
    description:
      "Deploy custom voice agents that handle inbound calls, texts, and email with your policies, knowledge, and escalation paths.",
    icon: Headphones,
    primary: { href: "/signup?posture=business", label: "Create a front desk agent" },
    secondary: { href: "/showcase", label: "Hear a demo" },
    sequence: [
      ["A customer reaches out", "Custom voice agent picks up on call, text or email."],
      [
        "Understands with your knowledge",
        "Trained on your policies, services, and escalation paths.",
      ],
      [
        "Resolves or hands off perfectly",
        "Complete context passed to the right person every time.",
      ],
    ],
    capabilities: [
      ["Custom voice front desk", "Agents that carry your tone, policies, and service knowledge."],
      [
        "Seamless booking & updates",
        "Voice agents that schedule and confirm across email and text.",
      ],
      ["Built for your business", "Each agent customized with your voice, playbook, and tools."],
    ],
    proof: "Customers get a useful answer sooner. Your team only joins when its judgment matters.",
  },
} as const;

type SolutionKey = keyof typeof SOLUTIONS;

export default function SolutionsPage() {
  const { wedge = "support" } = useParams<{ wedge: string }>();
  const key = (wedge in SOLUTIONS ? wedge : "support") as SolutionKey;
  const page = SOLUTIONS[key];
  const Icon = page.icon;

  return (
    <MarketingPageFrame mainClassName="!px-0 !pb-0 !pt-16">
      <PageMeta
        title={`${page.title} | Wireline`}
        description={page.description}
        path={`/solutions/${key}`}
      />

      <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-20 lg:px-8">
        <div className="wl-measure wl-marketing-center mx-auto">
          <div className="mx-auto max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
              <Icon size={14} className="text-primary" />
              <span className="wl-overline text-foreground">{page.eyebrow}</span>
            </div>
            <h1 className="wl-page-title mx-auto mt-6 max-w-[13ch] text-balance">{page.title}</h1>
            <p className="mt-6 max-w-2xl text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground sm:text-[var(--wireline-typography-h3-size)] sm:leading-8">
              Custom voice agents shaped around your voice, playbook, and processes.
            </p>
            <div className="marketing-hero__actions mt-8">
              <Link
                to={page.primary.href}
                className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                {page.primary.label} <ArrowRight size={15} />
              </Link>
              <Link
                to={page.secondary.href}
                className="marketing-btn-secondary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                {page.secondary.label}
              </Link>
            </div>
            <div className="mx-auto mt-8 max-w-md">
              <BrowserCallWidget agentName={key === "sales" ? "Sales Agent" : "Front Desk"} />
            </div>
          </div>
        </div>
      </section>

      <section className="wl-measure mx-auto px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="wl-marketing-center mx-auto max-w-2xl">
          <p className="wl-overline text-primary">One clear operating flow</p>
          <h2 className="wl-stitch-display mt-3 text-balance">
            The conversation moves. Your team stays in control.
          </h2>
        </div>
        <ol className="mt-10 grid gap-4 lg:grid-cols-3">
          {page.sequence.map(([title], index) => (
            <li key={title} className="wl-stitch-card relative p-6 sm:p-7">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--wireline-color-action-primary-container)] font-mono text-[var(--wireline-typography-caption-size)] font-semibold text-primary">
                0{index + 1}
              </span>
              <h3 className="wl-section-title mt-5 text-[clamp(1.15rem,1rem+.45vw,1.35rem)]">
                {title}
              </h3>
              <p className="mt-3 text-[var(--wireline-typography-caption-size)] leading-6 text-muted-foreground">
                {page.sequence[index][1]}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-border bg-card px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="wl-measure mx-auto">
          <div className="wl-marketing-center mx-auto max-w-3xl">
            <p className="wl-overline">Built for useful business work</p>
            <h2 className="wl-stitch-display mt-3 text-balance">
              The capabilities that make a conversation operational.
            </h2>
            <p className="mt-4 max-w-lg text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground">
              Start with a focused assignment. Expand into the next channel, connected account, or
              workflow only when it makes the outcome better.
            </p>
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-3">
            {page.capabilities.map(([title, copy], index) => {
              const CapabilityIcon = [MessageSquareText, CalendarClock, ShieldCheck][
                index
              ] as LucideIcon;
              return (
                <article key={title} className="wl-stitch-card bg-background p-5">
                  <CapabilityIcon size={18} className="text-primary" />
                  <h3 className="wl-card-title mt-4">{title}</h3>
                  <p className="mt-2 text-[var(--wireline-typography-caption-size)] leading-6 text-muted-foreground">
                    {copy}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="wl-measure mx-auto px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="wl-stitch-card wl-stitch-card-tinted wl-marketing-center grid justify-items-center gap-6 p-6 sm:p-8">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-primary">
              <CircleDot size={16} />
              <span className="wl-overline text-primary">The Wireline difference</span>
            </div>
            <p className="mt-4 text-[clamp(1.35rem,1.1rem+1vw,1.85rem)] font-semibold leading-[1.15] tracking-[-.035em] text-foreground">
              {page.proof}
            </p>
          </div>
          <Link
            to={page.primary.href}
            className="marketing-btn-primary min-h-12 shrink-0 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
          >
            Build your agent <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
