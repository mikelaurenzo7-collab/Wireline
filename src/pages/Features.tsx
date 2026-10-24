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
  type LucideIcon,
} from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";

type Pillar = {
  icon: LucideIcon;
  label: string;
  body: string;
  note?: string;
};

const PILLARS: readonly Pillar[] = [
  {
    icon: Phone,
    label: "Phone Number",
    body: "Answer questions, capture requests, and book available times with your configured calendar.",
  },
  {
    icon: Mail,
    label: "Email Address",
    body: "Read incoming messages, draft replies, and send approved email. Use a managed inbox or your verified domain with guided setup.",
    note: "Email activation requires a setup review.",
  },
  {
    icon: MonitorSmartphone,
    label: "Cloud Computer",
    body: "Research sites and complete web tasks in a live browser. See the work, take control, and hand it back.",
    note: "Included with paid plans.",
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
    icon: ClipboardCheck,
    title: "Clear Outcomes",
    body: "Review call records, approvals, and computer task results from your workspace.",
  },
  {
    icon: ShieldCheck,
    title: "Rehearse Before Launch",
    body: "Rehearse privately before activating live work.",
  },
];

export default function Features() {
  return (
    <MarketingPageFrame className="wl-features-page">
      <PageMeta
        title="Features | BotBound"
        description="Build a Bot for your life or your business. Answer calls, manage email, and assign tasks to its cloud computer."
        path="/features"
      />

      <section className="marketing-section marketing-section--screen">
        <div className="wl-public-rail mx-auto max-w-6xl">
          <header className="wl-features-intro text-center">
            <h1 className="marketing-hero-title mx-auto">Calls. Email. Computer.</h1>
            <p className="wl-features-intro__lead mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
              One Bot, your knowledge, and the tools to get work done.
            </p>
            <div className="marketing-hero__actions">
              <Link
                to="/signup"
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
            {PILLARS.map(({ icon: Icon, label, body, note }) => (
              <li key={label} className="wl-features-pillar">
                <span className="wl-features-pillar__icon" aria-hidden="true">
                  <Icon />
                </span>
                <h2 className="wl-features-pillar__title">{label}</h2>
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
            <Link to="/signup" className="marketing-btn-primary min-h-11 px-5">
              Get Started <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
