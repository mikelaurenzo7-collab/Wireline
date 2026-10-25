import { Link } from "react-router";
import {
  CalendarCheck,
  ClipboardCheck,
  Hand,
  Mail,
  MessageSquare,
  MonitorSmartphone,
  Phone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";

type Pillar = {
  id: string;
  icon: LucideIcon;
  label: string;
  body: string;
  note?: string;
};

const PILLARS: readonly Pillar[] = [
  {
    id: "calls",
    icon: Phone,
    label: "Calls",
    body: "Prospect, qualify leads, follow up on deals, and answer incoming calls. Choose a voice or clone your own.",
    note: "Outbound calls require recipient permission and an eligible line.",
  },
  {
    id: "sms",
    icon: MessageSquare,
    label: "SMS",
    body: "Keep conversations moving from your business number, with your knowledge, tone, and opt-out controls.",
    note: "Activation requires approved business and sender registration.",
  },
  {
    id: "email",
    icon: Mail,
    label: "Email",
    body: "Read requests, prepare replies, and send approved email with your business signature. Use a managed inbox or your verified domain.",
    note: "A setup review verifies your sending identity.",
  },
  {
    id: "computer",
    icon: MonitorSmartphone,
    label: "Cloud Computer",
    body: "Compare options, research leads, and work through forms in a live browser. Watch, take control, or let your Bot continue.",
    note: "Up to 15 minutes per session. Review the result and its sources.",
  },
];

const CAPABILITIES: readonly { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Sparkles,
    title: "Made Yours",
    body: "Your knowledge, preferences, and rules, shared across every job.",
  },
  {
    icon: CalendarCheck,
    title: "Native Calendar Booking",
    body: "Your availability, timezone, and booking rules. Sync Google or Outlook busy times.",
  },
  {
    icon: Hand,
    title: "Approvals and Handoffs",
    body: "Approve sensitive actions. Get the context when your Bot needs you.",
  },
  {
    icon: ClipboardCheck,
    title: "Clear Outcomes",
    body: "Review call records, approvals, and computer task results from your workspace.",
  },
];

export default function Features() {
  return (
    <MarketingPageFrame className="wl-features-page">
      <PageMeta
        title="Product | BotBound"
        description="One Bot for calls, SMS, email, and Computer work. Your knowledge, voice, and rules across every job."
        path="/features"
      />

      <section className="marketing-section marketing-section--screen">
        <div className="wl-public-rail mx-auto max-w-6xl">
          <header className="wl-features-intro text-center">
            <h1 className="marketing-hero-title mx-auto">One Bot. More Possibilities.</h1>
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
            {PILLARS.map(({ id, icon: Icon, label, body, note }) => (
              <li id={id} key={id} className="wl-features-pillar scroll-mt-24">
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
        </div>
      </section>
    </MarketingPageFrame>
  );
}
