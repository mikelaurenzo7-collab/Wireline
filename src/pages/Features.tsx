import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";
import { MARKETING_VOICE } from "../lib/product-copy";
import { signupHrefForPlan } from "../lib/signup-intent";

const CORE_FEATURES = [
  {
    icon: Workflow,
    title: "Shared Context",
    body: "Keep approved knowledge and customer history across calls, texts, and email.",
  },
  {
    icon: CheckCircle2,
    title: "Calls and Follow-ups",
    body: "Make calls, answer customers, and follow up by text or email.",
  },
  {
    icon: CalendarClock,
    title: "Scheduling and Handoff",
    body: "Check availability, book time, and hand off with context.",
  },
  {
    icon: ShieldCheck,
    title: "Your Rules and Approvals",
    body: "Set boundaries for sensitive actions and review the activity log.",
  },
  {
    icon: SlidersHorizontal,
    title: "Your Playbook",
    body: "Choose a role. Add the knowledge and instructions it needs.",
  },
  {
    icon: BarChart3,
    title: "Clear Outcomes",
    body: "See completed work, next steps, and requests that need you.",
  },
] as const;

export default function Features() {
  return (
    <MarketingPageFrame
      className="wl-features-page"
      stickyCta
      stickyCtaSecondaryHref="/pricing"
      stickyCtaSecondaryLabel="See Pricing"
    >
      <PageMeta
        title="FEATURES | BotBound"
        description="Build and train a Bot that calls, texts, emails, books, follows up, and logs outcomes under shared rules and memory."
        path="/features"
      />

      <section className="marketing-section marketing-section--screen">
        <div className="wl-public-rail mx-auto max-w-6xl">
          <header className="wl-features-intro text-left">
            <p className="wl-eyebrow text-primary">Features</p>
            <h1 className="marketing-hero-title mt-4 text-[clamp(1.9rem,3.4vw,2.9rem)]">
              BOTS THAT CALL, TEXT &amp; EMAIL
            </h1>
            <div className="wl-features-intro__next">
              <div className="marketing-hero__actions">
                <Link
                  to={signupHrefForPlan("personal")}
                  className="marketing-btn-primary min-h-11 px-5 text-sm font-semibold"
                >
                  START FREE
                </Link>
                <Link
                  to="/pricing"
                  className="marketing-btn-secondary min-h-11 px-5 text-sm font-semibold"
                >
                  SEE PRICING
                </Link>
              </div>
              <ol className="wl-features-intro__steps" aria-label="Get started">
                {MARKETING_VOICE.spine.map((step, index) => (
                  <li key={step}>
                    <span aria-hidden="true" className="text-primary">
                      0{index + 1}
                    </span>
                    <span className="wl-overline text-foreground">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </header>

          <h2 className="wl-features-controls wl-eyebrow text-muted-foreground">
            Built Around Your Business
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CORE_FEATURES.map(({ icon: Icon, title, body }) => (
              <FeatureCard key={title} icon={Icon} title={title} body={body} />
            ))}
          </div>
        </div>
      </section>
    </MarketingPageFrame>
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
    <article className="wl-stitch-card flex flex-col rounded-xl p-5 text-left">
      <span className="wl-accent-icon-chip mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg">
        <Icon size={16} aria-hidden="true" />
      </span>
      <h3 className="wl-card-title">{title}</h3>
      <p className="mt-1.5 max-w-[36ch] text-[13px] leading-[1.55] text-muted-foreground">{body}</p>
    </article>
  );
}
