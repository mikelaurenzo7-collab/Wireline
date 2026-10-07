import { Link } from "react-router";
import {
  ArrowRight,
  CalendarCheck,
  ClipboardCheck,
  Hand,
  Mail,
  MonitorSmartphone,
  Phone,
  ShieldCheck,
  Sparkles,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";
import { signupHrefForPlan } from "../lib/signup-intent";
import { MARKETING_CALLS_NOTICE } from "../lib/product-copy";

type Pillar = {
  icon: LucideIcon;
  label: string;
  title: string;
  body: string;
  note?: string;
};

const PILLARS: readonly Pillar[] = [
  {
    icon: Phone,
    label: "Phone Number",
    title: "Answers Every Call",
    body: "Pick a local number in Phone setup. Your Bot greets callers, answers questions, qualifies the request, books the appointment, and takes a clean message when a person is needed.",
    note: MARKETING_CALLS_NOTICE,
  },
  {
    icon: MonitorSmartphone,
    label: "Cloud Computer",
    title: "Finishes the Work",
    body: "Each Bot gets a secure cloud browser. It looks things up, reads your site, and fills in web forms to finish follow-up. It pauses for you at logins and payments, and only submits what you ask it to.",
    note: "Included with paid plans.",
  },
  {
    icon: Mail,
    label: "Branded Email",
    title: "Follows Up in Writing",
    body: "A managed inbox for your Bot, or your own domain with guided setup. It sends the recap, answers replies, and keeps the thread tied to the same customer.",
  },
];

const CAPABILITIES: readonly { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Sparkles,
    title: "Trained on Your Business",
    body: "Facts, sources, policies, voice, and tone. Your Bot answers the way your best person would.",
  },
  {
    icon: CalendarCheck,
    title: "Native Calendar Booking",
    body: "Weekly availability, your timezone, and booking rules. Google and Outlook busy time stays respected.",
  },
  {
    icon: Hand,
    title: "Approvals and Handoffs",
    body: "Sensitive work waits for your OK. A person gets the full context when a caller needs one.",
  },
  {
    icon: Waypoints,
    title: "Shared Context",
    body: "Calls, email, and computer tasks share one memory, so nobody repeats themselves.",
  },
  {
    icon: ClipboardCheck,
    title: "Clear Outcomes",
    body: "Every call, message, and task is logged with what happened and what comes next.",
  },
  {
    icon: ShieldCheck,
    title: "Private Test First",
    body: "Rehearse privately before your Bot goes live. Build and test free, no card required.",
  },
];

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
        description="Build and train a Bot that calls, texts, emails, books, follows up, and logs outcomes under shared rules and memory."
        path="/features"
      />

      <section className="marketing-section marketing-section--screen">
        <div className="wl-public-rail mx-auto max-w-6xl">
          <header className="wl-features-intro text-center">
            <p className="wl-eyebrow text-primary">Features</p>
            <h1 className="marketing-hero-title mx-auto mt-4 text-[clamp(1.9rem,3.4vw,2.9rem)]">
              Inbound &amp; Outbound Bots
            </h1>
            <p className="wl-features-intro__lead mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Build and test free. Paid plans give your Bot a phone number, a cloud computer, and a
              branded inbox, trained on your business and governed by your rules.
            </p>
            <div className="marketing-hero__actions">
              <Link
                to={signupHrefForPlan("personal")}
                className="marketing-btn-primary min-h-11 px-5 text-sm font-semibold"
              >
                Start Free
              </Link>
              <Link
                to="/pricing"
                className="marketing-btn-secondary min-h-11 px-5 text-sm font-semibold"
              >
                See Pricing
              </Link>
            </div>
          </header>

          <ul className="wl-features-pillars" aria-label="What every Bot gets">
            {PILLARS.map(({ icon: Icon, label, title, body, note }) => (
              <li key={label} className="wl-features-pillar">
                <span className="wl-features-pillar__icon" aria-hidden="true">
                  <Icon />
                </span>
                <p className="wl-features-pillar__label">{label}</p>
                <h2 className="wl-features-pillar__title">{title}</h2>
                <p className="wl-features-pillar__body">{body}</p>
                {note ? <p className="wl-features-pillar__note">{note}</p> : null}
              </li>
            ))}
          </ul>

          <h2 id="features-list-title" className="wl-features-controls">
            Built Around Your Business
          </h2>
          <ul aria-labelledby="features-list-title" className="wl-features-grid text-left">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="wl-features-grid__item">
                <Icon aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="wl-features-closing">
            <Link
              to={signupHrefForPlan("personal")}
              className="marketing-btn-primary min-h-11 px-5"
            >
              Build Your Bot Free <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
