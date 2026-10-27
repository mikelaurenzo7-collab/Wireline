import { Link } from "react-router";
import { Mail, MessageSquare, MonitorSmartphone, Phone, type LucideIcon } from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { useAuth } from "../contexts/AuthContext";
import { PageMeta } from "../lib/page-meta";

type Pillar = {
  id: string;
  icon: LucideIcon;
  label: string;
  body: string;
};

const PILLARS: readonly Pillar[] = [
  {
    id: "calls",
    icon: Phone,
    label: "Calls",
    body: "Answer the phone and book the job.",
  },
  {
    id: "sms",
    icon: MessageSquare,
    label: "SMS",
    body: "Keep the conversation going.",
  },
  {
    id: "email",
    icon: Mail,
    label: "Email",
    body: "Reply with your signature.",
  },
  {
    id: "computer",
    icon: MonitorSmartphone,
    label: "Cloud Computer",
    body: "Research it, then finish the task.",
  },
];

export default function Features() {
  const signedIn = Boolean(useAuth().user);

  return (
    <MarketingPageFrame className="wl-features-page">
      <PageMeta
        title="Product | BotBound"
        description="Create Bots for calls, SMS, email, and Computer work. Give each its own knowledge, voice, and rules."
        path="/features"
      />

      <section className="marketing-section marketing-section--screen">
        <div className="wl-public-rail mx-auto max-w-6xl">
          <header className="wl-features-intro text-center">
            <h1 className="marketing-hero-title mx-auto">Bots for Every Job.</h1>
            <p className="marketing-hero-lead mx-auto mt-4">Calls, texts, email, and Computer.</p>
            <div className="marketing-hero__actions">
              <Link
                to={signedIn ? "/studio" : "/signup"}
                className="marketing-btn-primary min-h-11 px-5 text-sm font-semibold"
              >
                {signedIn ? "Open Workspace" : "Get Started"}
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
            {PILLARS.map(({ id, icon: Icon, label, body }) => (
              <li id={id} key={id} className="wl-features-pillar scroll-mt-24">
                <span className="wl-features-pillar__icon" aria-hidden="true">
                  <Icon />
                </span>
                <h2 className="wl-features-pillar__title">{label}</h2>
                <p className="wl-features-pillar__body">{body}</p>
              </li>
            ))}
          </ul>

          <p className="mx-auto mt-10 max-w-xl text-center text-sm text-muted-foreground">
            Outbound calls and texts wait for permission and carrier approval.
          </p>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
