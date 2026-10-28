import { Link } from "react-router";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { useAuth } from "../contexts/AuthContext";
import { PageMeta } from "../lib/page-meta";

type Pillar = {
  id: string;
  label: string;
  body: string;
};

const PILLARS: readonly Pillar[] = [
  {
    id: "calls",
    label: "Calls",
    body: "Answer, call out, and follow up.",
  },
  {
    id: "sms",
    label: "SMS",
    body: "Text from the same Bot.",
  },
  {
    id: "email",
    label: "Email",
    body: "Read and reply with your business identity.",
  },
  {
    id: "computer",
    label: "Cloud Computer",
    body: "Research and work on the web.",
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
                {signedIn ? "Open Workspace" : "GET STARTED"}
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
            {PILLARS.map(({ id, label, body }) => (
              <li id={id} key={id} className="wl-features-pillar scroll-mt-24">
                <h2 className="wl-features-pillar__title">{label}</h2>
                <p className="wl-features-pillar__body">{body}</p>
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
