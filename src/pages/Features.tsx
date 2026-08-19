import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import MarketingChromeBar from "../components/marketing/MarketingChromeBar";
import MarketingHero from "../components/marketing/MarketingHero";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { PageMeta } from "../lib/page-meta";
import { MARKETING_VOICE } from "../lib/product-copy";

const CHANNEL_CAPABILITIES = ["Voice", "Live Conversations", "Text / SMS", "Email"] as const;

const CORE_FEATURES = [
  {
    icon: Workflow,
    title: "One Conversation Memory",
    body: "Calls, texts, and email share business knowledge, customer context, rules, and history.",
  },
  {
    icon: CheckCircle2,
    title: "Work That Finishes",
    body: "Book, update, recap, route the exception, and preserve proof. Not just a transcript.",
  },
  {
    icon: CalendarClock,
    title: "Scheduling and Handoff",
    body: "Offer real availability and pass the request without making the customer repeat context.",
  },
  {
    icon: ShieldCheck,
    title: "Approvals and Safety",
    body: "Keep sensitive actions behind controls and audit what happened before and after execution.",
  },
  {
    icon: SlidersHorizontal,
    title: "Training by Workflow",
    body: "Tune one Bot for sales, support, billing, scheduling, recovery, or a custom playbook.",
  },
  {
    icon: BarChart3,
    title: "Outcomes over Activity",
    body: "See what happened, what changed, and what needs attention across every channel.",
  },
] as const;

export default function Features() {
  return (
    <div className="marketing-surface wl-features-page bg-background text-foreground">
      <PageMeta
        title="FEATURES | BOTBOUND VOICE BOTS"
        description="Build and train a voice-first Bot that calls, holds natural conversations, texts, emails, books, follows up, updates connected systems, and logs outcomes under shared rules and memory."
        path="/features"
      />
      <PrecisionPublicHeader />

      <main id="main-content" className="marketing-flow" tabIndex={-1}>
        {/*
          One screen: channels as text chips (icons restated the labels), then
          the six control cards that carry the argument.
        */}
        <section className="marketing-section marketing-section--screen">
          <MarketingHero
            title="VOICE-FIRST BOTS FOR EVERY CUSTOMER CONVERSATION"
            primaryAction={{ label: "BUILD YOUR BOT", to: "/signup?plan=personal" }}
            secondaryAction={{
              label: "HEAR A DEMO",
              to: "/showcase",
              tone: "secondary",
            }}
          />

          <div className="wl-public-rail mt-3">
            <p className="sr-only">Build. Configure. Launch. Improve.</p>
            <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              {MARKETING_VOICE.proof.map((step, index) => (
                <li key={step} className="flex items-center gap-2">
                  {index > 0 ? (
                    <span aria-hidden="true" className="text-xs text-muted-foreground">
                      /
                    </span>
                  ) : null}
                  <span className="wl-overline text-foreground">{step}</span>
                </li>
              ))}
            </ol>

            <ul className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {CHANNEL_CAPABILITIES.map((title) => (
                <li
                  key={title}
                  className="wl-channel-chip inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground"
                >
                  {title}
                </li>
              ))}
            </ul>

            <p className="wl-eyebrow mx-auto mt-4 text-center text-muted-foreground">
              The Controls That Make It Reliable
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CORE_FEATURES.map(({ icon: Icon, title, body }) => (
                <FeatureCard key={title} icon={Icon} title={title} body={body} />
              ))}
            </div>
          </div>
        </section>
      </main>

      <MarketingChromeBar />
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <article className="wl-stitch-card group flex flex-col items-center rounded-xl p-3.5 text-center transition-all hover:-translate-y-px hover:shadow-sm">
      <Icon
        size={18}
        className="text-primary transition group-hover:scale-110"
        aria-hidden="true"
      />
      <h3 className="wl-card-title mx-auto mt-2 max-w-[18ch]">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-[36ch] text-[13px] leading-[1.5] text-muted-foreground">
        {body}
      </p>
    </article>
  );
}
