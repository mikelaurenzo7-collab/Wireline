import { Link } from "react-router";
import {
  ArrowRight,
  Check,
  Clock,
  Globe,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";

import BotBoundMark from "../brand/BotBoundMark";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import { useAuth } from "../../contexts/AuthContext";
import { BOT_MARKETING_VOICE } from "../../lib/bot-product";

const EXAMPLES = [
  {
    id: "phone",
    label: "Phone Number",
    badge: "Dedicated Local Line",
    summary:
      "Answers inbound calls, runs reviewed outbound follow-ups, and texts customers on the same thread.",
    Icon: Phone,
  },
  {
    id: "email",
    label: "Email Address",
    badge: "Managed Inbox Identity",
    summary:
      "Reads incoming threads, drafts or sends replies from your domain, and logs every commitment.",
    Icon: Mail,
  },
  {
    id: "computer",
    label: "A Computer",
    badge: "Live Cloud Browser",
    summary:
      "Researches vendors, checks availability, fills web forms, and hands control to you whenever needed.",
    Icon: Globe,
  },
] as const;

type ChannelId = (typeof EXAMPLES)[number]["id"];

const WORKSPACE_STEPS = [
  {
    step: "01",
    title: "Write instructions in plain English",
    detail:
      "Tell your Bot how to greet callers, what questions to ask, your pricing rules, and when to escalate to you.",
    Icon: Sparkles,
  },
  {
    step: "02",
    title: "Rehearse privately before going live",
    detail:
      "Test voice calls and message threads in a private sandbox until every answer sounds right.",
    Icon: Terminal,
  },
  {
    step: "03",
    title: "Supervise every call, email, and browser task",
    detail:
      "Review transcripts, sources, and browser steps in one calm workspace. Step in live with one click.",
    Icon: ShieldCheck,
  },
] as const;

function CapabilityPreview({ channel }: { channel: ChannelId }) {
  if (channel === "phone") {
    return (
      <div className="landing-prestige__demo landing-prestige__demo--phone" aria-hidden="true">
        <div className="landing-prestige__window-bar">
          <span className="landing-prestige__status-pill">
            <span className="landing-prestige__live-dot" />
            (312) 555-0148
          </span>
          <span className="landing-prestige__meta-tag">Inbound and outbound</span>
        </div>

        <div className="landing-prestige__call-stage">
          <div className="landing-prestige__call-meta">
            <span className="landing-prestige__call-party">Front Desk Bot</span>
            <span className="landing-prestige__call-timer">01:24</span>
          </div>
          <div className="landing-prestige__wave">
            <span style={{ "--bar-h": "38%" } as React.CSSProperties} />
            <span style={{ "--bar-h": "72%" } as React.CSSProperties} />
            <span style={{ "--bar-h": "54%" } as React.CSSProperties} />
            <span style={{ "--bar-h": "92%" } as React.CSSProperties} />
            <span style={{ "--bar-h": "64%" } as React.CSSProperties} />
            <span style={{ "--bar-h": "86%" } as React.CSSProperties} />
            <span style={{ "--bar-h": "44%" } as React.CSSProperties} />
            <span style={{ "--bar-h": "78%" } as React.CSSProperties} />
            <span style={{ "--bar-h": "95%" } as React.CSSProperties} />
            <span style={{ "--bar-h": "58%" } as React.CSSProperties} />
            <span style={{ "--bar-h": "70%" } as React.CSSProperties} />
            <span style={{ "--bar-h": "42%" } as React.CSSProperties} />
          </div>
        </div>

        <div className="landing-prestige__sms">
          <div className="landing-prestige__sms-head">
            <span className="landing-prestige__demo-pill">
              <MessageSquare className="size-3" />
              <span>SMS</span>
            </span>
            <span className="landing-prestige__sms-Sub">Instant text follow-up</span>
          </div>
          <span className="sr-only">Customer question</span>
          <p className="landing-prestige__bubble">Could I book for Thursday?</p>
          <p className="landing-prestige__bubble landing-prestige__bubble--bot">
            Confirmed for Thursday at 10:30 AM. Your appointment is booked.
          </p>
        </div>
      </div>
    );
  }

  if (channel === "email") {
    return (
      <div className="landing-prestige__demo landing-prestige__demo--email" aria-hidden="true">
        <div className="landing-prestige__window-bar">
          <span className="landing-prestige__email-address">frontdesk@oakparklock.com</span>
          <span className="landing-prestige__verified-tag">
            <Check className="size-3" /> Verified Domain
          </span>
        </div>

        <div className="landing-prestige__email-thread">
          <div className="landing-prestige__email-header">
            <p className="landing-prestige__email-subject">Subject: Saturday lock change</p>
            <span className="landing-prestige__email-from">From: maya.lin@clientmail.com</span>
          </div>

          <div className="landing-prestige__email-incoming">
            Hi, we need three commercial cylinders rekeyed this Saturday morning. Do you have an
            opening and what is the dispatch rate?
          </div>

          <div className="landing-prestige__email-reply">
            <div className="landing-prestige__email-reply-bar">
              <span className="landing-prestige__demo-pill">Bot Reply Sent</span>
              <span className="landing-prestige__email-time">Just now</span>
            </div>
            <p className="landing-prestige__email-body">
              We can be there at 10:30 AM on Saturday. Our standard commercial rekey rate applies.
              Reply to confirm and I will lock in the slot.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="landing-prestige__demo landing-prestige__demo--computer" aria-hidden="true">
      <div className="landing-prestige__browser-bar">
        <span className="landing-prestige__browser-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="landing-prestige__browser-url">
          <Lock className="size-2.5 shrink-0" />
          <span className="min-w-0 truncate">dispatch.oakparklock.com/schedule</span>
        </span>
      </div>

      <div className="landing-prestige__browser-stage">
        <div className="landing-prestige__browser-task">
          <span className="landing-prestige__task-step">
            <Clock className="size-3" /> Step 3 of 3
          </span>
          <span className="landing-prestige__task-status">Find an open time · Checking Saturday technician slots</span>
        </div>

        <div className="landing-prestige__browser-card">
          <div className="landing-prestige__browser-card-head">
            <p className="landing-prestige__browser-title">Book Service Appointment</p>
            <span className="landing-prestige__browser-sub">3 Commercial Cylinders · Oak Park</span>
          </div>
          <div className="landing-prestige__slots">
            <span className="landing-prestige__slot landing-prestige__slot--active">
              <Check className="size-3" /> Sat 10:30
            </span>
            <span className="landing-prestige__slot">Tue 2:00</span>
            <span className="landing-prestige__slot">Thu 11:15</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WireAgentLanding() {
  const { user } = useAuth();
  const signedIn = Boolean(user);

  return (
    <div className="marketing-surface landing-prestige">
      <PrecisionPublicHeader />

      <main id="main-content" className="landing-prestige__main" tabIndex={-1}>
        <section className="landing-prestige__hero" aria-label={BOT_MARKETING_VOICE.headline}>
          <div className="landing-prestige__hero-badge">
            <BotBoundMark className="landing-prestige__hero-mark" />
            <span className="landing-prestige__hero-badge-copy">
              Autonomous Voice, Inbox &amp; Cloud Computer
            </span>
          </div>

          <h1>
            <span className="landing-prestige__hero-lead">Your next hire</span>{" "}
            <span className="landing-prestige__hero-accent">is a bot.</span>
          </h1>

          <p className="landing-prestige__hero-subcopy">
            Give your business a dedicated phone number, an email address, and a cloud computer in
            one calm workspace. Your Bot answers calls, replies to messages, and completes web tasks
            under your rules.
          </p>

          <div className="landing-prestige__actions">
            <Link
              to={signedIn ? "/studio" : "/signup"}
              className="marketing-btn-primary landing-prestige__cta"
            >
              <span>{signedIn ? "Open Workspace" : BOT_MARKETING_VOICE.primaryCta}</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link to="/pricing" className="marketing-btn-secondary landing-prestige__secondary-cta">
              See Pricing
            </Link>
          </div>
        </section>

        <section
          className="landing-prestige__showcase"
          aria-labelledby="landing-prestige-showcase-title"
        >
          <div className="landing-prestige__section-head">
            <h2 id="landing-prestige-showcase-title" className="landing-prestige__showcase-heading">
              The Bot Gets:
            </h2>
            <p className="landing-prestige__section-sub">
              Three real operating channels connected to the same memory, instructions, and approval
              rules.
            </p>
          </div>

          <div className="landing-prestige__showcase-grid">
            {EXAMPLES.map(({ id, label, badge, summary, Icon }) => (
              <article key={id} className="landing-prestige__card">
                <div className="landing-prestige__card-top">
                  <div className="landing-prestige__card-head">
                    <span className="landing-prestige__card-icon" aria-hidden="true">
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <h3 className="landing-prestige__card-label">{label}</h3>
                      <span className="landing-prestige__card-badge">{badge}</span>
                    </div>
                  </div>
                  <p className="landing-prestige__card-summary">{summary}</p>
                </div>
                <CapabilityPreview channel={id} />
              </article>
            ))}
          </div>
        </section>

        <section
          className="landing-prestige__workflow"
          aria-labelledby="landing-prestige-workflow-title"
        >
          <div className="landing-prestige__section-head">
            <span className="landing-prestige__kicker">How It Works</span>
            <h2 id="landing-prestige-workflow-title" className="landing-prestige__workflow-heading">
              Built for supervision, not guesswork.
            </h2>
            <p className="landing-prestige__section-sub">
              Configure your Bot in minutes, test it privately, and watch its work in real time.
            </p>
          </div>

          <div className="landing-prestige__workflow-grid">
            {WORKSPACE_STEPS.map(({ step, title, detail, Icon }) => (
              <div key={step} className="landing-prestige__step-card">
                <div className="landing-prestige__step-head">
                  <span className="landing-prestige__step-num">{step}</span>
                  <span className="landing-prestige__step-icon" aria-hidden="true">
                    <Icon className="size-4" />
                  </span>
                </div>
                <h3 className="landing-prestige__step-title">{title}</h3>
                <p className="landing-prestige__step-body">{detail}</p>
              </div>
            ))}
          </div>

          <div className="landing-prestige__bottom-band">
            <div className="landing-prestige__bottom-copy">
              <h3>Ready to put your Bot to work?</h3>
              <p>
                Shared usage across calls, SMS, email, and hosted browser tasks with transparent,
                scalable plans.
              </p>
            </div>
            <div className="landing-prestige__bottom-actions">
              <Link
                to={signedIn ? "/studio" : "/signup"}
                className="marketing-btn-primary landing-prestige__cta"
              >
                <span>{signedIn ? "Open Workspace" : "Get Started"}</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                to="/features"
                className="marketing-btn-secondary landing-prestige__secondary-cta"
              >
                Explore Product
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-prestige__utility" aria-label="Legal and support">
        <div className="landing-prestige__utility-inner">
          <span className="landing-prestige__utility-brand">
            BotBound · Autonomous Business Operations
          </span>
          <div className="landing-prestige__utility-links">
            <Link to="/features">Product</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/developers">Developers</Link>
            <Link to="/trust">Trust</Link>
            <Link to="/support">Support</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
