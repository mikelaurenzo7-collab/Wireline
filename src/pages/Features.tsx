import { Link } from "react-router";
import { Globe, Mail, MessageSquare, Phone } from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { useAuth } from "../contexts/AuthContext";
import { PageMeta } from "../lib/page-meta";

type Pillar = {
  id: string;
  label: string;
  body: string;
  points: readonly string[];
  Icon: typeof Phone;
};

const PILLARS: readonly Pillar[] = [
  {
    id: "calls",
    label: "Calls",
    body: "Answer incoming callers around the clock, run reviewed outbound calls, and book or route callers under your rules.",
    points: [
      "Dedicated local phone number",
      "Real-time voice with instant escalation",
      "Full transcript and call summary",
    ],
    Icon: Phone,
  },
  {
    id: "sms",
    label: "SMS",
    body: "Text from the same Bot number so confirmations, links, and follow-ups stay in one conversation.",
    points: [
      "Two-way SMS on your Bot line",
      "Post-call text confirmations",
      "Permission-aware messaging controls",
    ],
    Icon: MessageSquare,
  },
  {
    id: "email",
    label: "Email",
    body: "Read incoming threads, draft or send replies with your business identity, and keep every commitment logged.",
    points: [
      "BotBound address or custom domain",
      "Gmail and Outlook connection support",
      "Rule-based auto-reply or draft review",
    ],
    Icon: Mail,
  },
  {
    id: "computer",
    label: "A Computer",
    body: "Research vendors, check schedules, and complete web tasks in a supervised cloud browser.",
    points: [
      "Live browser view beside your chat",
      "One-click owner takeover for logins",
      "Cited sources and step-by-step history",
    ],
    Icon: Globe,
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
            <h1 className="marketing-hero-title mx-auto">Bots for every job.</h1>
            <p className="wl-public-copy mx-auto max-w-2xl">
              Every Bot combines a phone line, an inbox, and a cloud computer in one workspace so
              customer conversations and web tasks never fall through the cracks.
            </p>
            <div className="marketing-hero__actions">
              <Link
                to={signedIn ? "/studio" : "/signup"}
                className="marketing-btn-primary min-h-11 px-5 text-sm font-semibold"
              >
                {signedIn ? "Open Workspace" : "Get Started →"}
              </Link>
              <Link
                to="/pricing"
                className="marketing-btn-secondary min-h-11 px-5 text-sm font-semibold"
              >
                See Pricing
              </Link>
            </div>
          </header>

          <ul
            id="features-list-title"
            className="wl-features-pillars"
            aria-label="Available Bot capabilities"
          >
            {PILLARS.map(({ id, label, body, points, Icon }) => (
              <li id={id} key={id} className="wl-features-pillar scroll-mt-24">
                <div className="landing-prestige__card-head">
                  <span className="landing-prestige__card-icon" aria-hidden="true">
                    <Icon className="size-4" />
                  </span>
                  <h2 className="wl-features-pillar__title">{label}</h2>
                </div>
                <p className="wl-features-pillar__body">{body}</p>
                <ul className="wl-features-pillar__list">
                  {points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
            Every channel works under your rules: recipient permission for outbound calls and texts,
            a setup review that verifies your sending identity, and up to 15 minutes per Computer
            session with the result and its sources ready to review.
          </p>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
