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
    body: "Prospect, qualify leads, follow up on deals, and answer incoming calls. Choose a voice or clone your own.",
  },
  {
    id: "sms",
    icon: MessageSquare,
    label: "SMS",
    body: "Keep conversations moving from your business number, with your knowledge, tone, and opt-out controls.",
  },
  {
    id: "email",
    icon: Mail,
    label: "Email",
    body: "Read requests, prepare replies, and send approved email with your business signature. Use a managed inbox or your verified domain.",
  },
  {
    id: "computer",
    icon: MonitorSmartphone,
    label: "Cloud Computer",
    body: "Compare options, research leads, and work through forms in a live browser. Watch, take control, or let your Bot continue.",
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
            <h1 className="marketing-hero-title mx-auto">BOTS FOR EVERY JOB.</h1>
            <div className="marketing-hero__actions">
              <Link
                to={signedIn ? "/studio" : "/signup"}
                className="marketing-btn-primary min-h-11 px-5 text-sm font-semibold"
              >
                {signedIn ? "Open Workspace" : "GET YOUR SALES BOT"}
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

          <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
            Every channel works under your rules: recipient permission for outbound calls and
            texts, a setup review that verifies your sending identity, and up to 15 minutes per
            Computer session with the result and its sources ready to review.
          </p>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
