import { Link } from "react-router";
import {
  ArrowRight,
  CalendarCheck,
  ClipboardCheck,
  Hand,
  Mail,
  MonitorSmartphone,
  Phone,
  PhoneOutgoing,
  ShieldCheck,
  Sparkles,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";
import { signupHrefForPlan } from "../lib/signup-intent";

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
    title: "Ready When the Phone Rings",
    body: "Your Bot answers calls, handles questions, and takes requests. With a configured calendar, it can book available times.",
  },
  {
    icon: MonitorSmartphone,
    label: "Cloud Computer",
    title: "Works From a Goal",
    body: "Give your Bot a goal and a cloud browser. It researches, navigates sites, and fills in forms. When it pauses for you, take control of the browser and hand it back.",
    note: "Included with paid plans.",
  },
  {
    icon: Mail,
    label: "Email Address",
    title: "Follows Up in Writing",
    body: "A managed inbox for your Bot, or your own domain with guided setup. It reads incoming messages, drafts replies, and sends approved email.",
    note: "Email activation requires a setup review.",
  },
];

const CAPABILITIES: readonly { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: PhoneOutgoing,
    title: "Reviewed Calls",
    body: "Place a personal coordination call or a specific business service call with recipient permission. Available on eligible paid lines when both parties are in Illinois.",
  },
  {
    icon: Sparkles,
    title: "Made Yours",
    body: "Your knowledge, preferences, voice, and rules shape how your Bot works.",
  },
  {
    icon: CalendarCheck,
    title: "Native Calendar Booking",
    body: "Weekly availability, your timezone, and booking rules. Optionally import Google or Outlook busy times when you sync.",
  },
  {
    icon: Hand,
    title: "Approvals and Handoffs",
    body: "Sensitive work waits for your OK. A person gets the full context when a caller needs one.",
  },
  {
    icon: Waypoints,
    title: "One Workspace",
    body: "Manage your Bot's calls, email, and computer tasks from one place.",
  },
  {
    icon: ClipboardCheck,
    title: "Clear Outcomes",
    body: "Review call records, approvals, and computer task results from your workspace.",
  },
  {
    icon: ShieldCheck,
    title: "Rehearse Before Launch",
    body: "Choose Personal or the channels you need, then teach your Bot before it goes live.",
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
        description="Build a Bot for your life or your business. Answer calls, manage email, and assign tasks to its cloud computer."
        path="/features"
      />

      <section className="marketing-section marketing-section--screen">
        <div className="wl-public-rail mx-auto max-w-6xl">
          <header className="wl-features-intro text-center">
            <p className="wl-eyebrow text-primary">Features</p>
            <h1 className="marketing-hero-title mx-auto mt-4 text-[clamp(1.9rem,3.4vw,2.9rem)]">
              A Bot for Your Life and Work
            </h1>
            <p className="wl-features-intro__lead mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Create your Bot free. Add a phone number, email address, and cloud computer with the
              plan that fits your needs.
            </p>
            <div className="marketing-hero__actions">
              <Link
                to={signupHrefForPlan("personal")}
                className="marketing-btn-primary min-h-11 px-5 text-sm font-semibold"
              >
                Get Started
              </Link>
              <Link
                to="/pricing"
                className="marketing-btn-secondary min-h-11 px-5 text-sm font-semibold"
              >
                See Pricing
              </Link>
            </div>
          </header>

          <ul className="wl-features-pillars" aria-label="Available Bot capabilities">
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
            Built Around You
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
              Create Your Bot Free <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
