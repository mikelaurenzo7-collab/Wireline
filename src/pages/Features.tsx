import { Link } from "react-router";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";
import { signupHrefForPlan } from "../lib/signup-intent";
import { MARKETING_CALLS_NOTICE } from "../lib/product-copy";

const CORE_FEATURES = [
  "Shared Context",
  "Calls and Follow-Ups",
  "Scheduling and Handoff",
  "Your Rules and Approvals",
  "Your Playbook",
  "Clear Outcomes",
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
        title="Features | BotBound"
        description="See how a BotBound Voice Bot answers business calls, follows your playbook, schedules next steps, and routes complex requests. Calls plans include a local number; Email plans add a branded BotBound inbox."
        path="/features"
      />

      <section className="marketing-section marketing-section--screen">
        <div className="wl-public-rail mx-auto max-w-6xl">
          <header className="wl-features-intro text-left">
            <p className="wl-eyebrow text-primary">Features</p>
            <h1 className="marketing-hero-title mt-4 text-[clamp(1.9rem,3.4vw,2.9rem)]">
              Voice Bots for Business Calls
            </h1>
            <p className="marketing-hero-lead mt-4 max-w-3xl">
              Answer, qualify, and route with a Bot built around your playbook. Calls plans include
              one local number. Email plans add a branded BotBound inbox.
            </p>
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
            <p className="mt-4 text-sm text-muted-foreground">{MARKETING_CALLS_NOTICE}</p>
          </header>

          <h2
            id="features-list-title"
            className="wl-features-controls wl-eyebrow text-muted-foreground"
          >
            Built Around Your Business
          </h2>
          <ul
            aria-labelledby="features-list-title"
            className="mt-3 grid list-disc gap-x-12 gap-y-5 pl-5 text-left text-base font-semibold marker:text-primary sm:grid-cols-2 lg:grid-cols-3"
          >
            {CORE_FEATURES.map((feature) => (
              <li key={feature} className="pl-1">
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
