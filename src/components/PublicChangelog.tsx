/**
 * PublicChangelog.tsx — public-facing changelog at /changelog.
 */
import { Rocket, Shield, Sparkles, Wrench, Zap } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingChrome from "./marketing/MarketingChrome";

type EntryTag = "launch" | "feature" | "infra" | "polish" | "security";

interface ChangelogEntry {
  date: string;
  tag: EntryTag;
  title: string;
  body: string;
}

const TAG_META: Record<EntryTag, { label: string; tone: string; icon: typeof Sparkles }> = {
  launch: {
    label: "Launch",
    tone: "bg-brand/10 text-brand border-brand/25",
    icon: Rocket,
  },
  feature: {
    label: "Feature",
    // `text-brand-deep` (#8B5CF6) on this tinted panel measures 4.07:1 at 10px
    // bold — under AA, and axe flags it. `text-brand` is the same family at the
    // contrast the other three tags already use.
    tone: "bg-brand/8 text-brand border-brand/20",
    icon: Sparkles,
  },
  infra: {
    label: "Infra",
    tone: "bg-brand/6 text-brand border-brand/15",
    icon: Zap,
  },
  polish: {
    label: "Polish",
    tone: "bg-ink/5 text-foreground/70 border-ink/10",
    icon: Wrench,
  },
  security: {
    label: "Security",
    tone: "bg-destructive/10 text-destructive border-destructive/25",
    icon: Shield,
  },
};

const ENTRIES: ChangelogEntry[] = [
  {
    date: "Oct 19, 2026",
    tag: "feature",
    title: "Workspace and a More Natural Phone Voice",
    body: "Your Bot's workspace brings its conversation, setup, knowledge, and computer together. Try It supports private voice and text rehearsals. Phone calls use the updated voice engine, and voice settings identify the voice callers hear.",
  },
  {
    date: "Oct 10, 2026",
    tag: "feature",
    title: "Cloud Computer, More Knowledge Formats, and Inbox Replies",
    body: "Bots can use a cloud browser for guided tasks. Owners can take control when a sign in or decision needs a person. Knowledge accepts PDF, Word, and Excel uploads, and configured inboxes support replies within an email thread. Public and Studio pages received a visual consistency pass. Paid email activation still requires a setup review.",
  },
  {
    date: "Aug 17, 2026",
    tag: "infra",
    title: "Production Phone Calls Use a Dedicated Calling Path",
    body: "Incoming calls run through BotBound's managed calling stack, with dedicated routing and health checks. Private rehearsals remain separate from customer traffic.",
  },
  {
    date: "Aug 11, 2026",
    tag: "launch",
    title: "Deeper Release Checks Before Anything Ships",
    body: "Release checks match the scope of each change, including code quality, relevant tests, and additional security or database checks when needed. Health checks after promotion verify the live service, and demo or test activity stays separate from real customer evidence.",
  },
  {
    date: "Jul 25, 2026",
    tag: "infra",
    title: "One Managed Reasoning Policy Across Demos and Studio",
    body: "Structured reasoning and private rehearsals use a managed policy with continuity paths. Production phone calls keep their dedicated calling runtime. Private rehearsals do not take over customer calls.",
  },
  {
    date: "Jul 13, 2026",
    tag: "feature",
    title: "Fast Start Turns a Blank Workspace into a First Working Bot",
    body: "Create a Bot, add knowledge, and rehearse privately in the workspace. Activate the channels in your plan when you are ready to use a number or mailbox.",
  },
  {
    date: "Jul 13, 2026",
    tag: "security",
    title: "Safer Exports and Voice Previews",
    body: "Account exports include historical training records scoped to the account without exposing them to browser roles. Internal database helpers are no longer public RPCs, and voice previews use the supported voice with clear recovery when a sample is unavailable.",
  },
  {
    date: "Jun 4, 2026",
    tag: "security",
    title: "OAuth Sign In Store Sealed Off from the Data API",
    body: "A security review closed direct data API access to the temporary OAuth bridge used during sign in. Row level security, explicit grants, and related tenant policy checks now keep that flow inside the server callback path.",
  },
  {
    date: "Jun 4, 2026",
    tag: "polish",
    title: "Every Console Page Fills the Screen, Top to Bottom",
    body: "On larger monitors several authenticated pages (Activity, Calls, and others) left content stranded in the upper half with dead space below. The page shell now stretches content to the full viewport height: empty states center, dashboards fill, and chat anchors its composer to the bottom. No more “cut off in the middle” on big screens.",
  },
  {
    date: "Jun 4, 2026",
    tag: "polish",
    title: "Sidebar Spacing Is Even at Every Screen Size",
    body: "On tall desktop monitors the left navigation rail floated its items in the vertical middle, leaving an awkward gap under Search. Items now anchor directly beneath Search with a consistent rhythm and clean group separators, scaling identically from a 13 inch laptop to a 27 inch display.",
  },
  {
    date: "Jun 4, 2026",
    tag: "polish",
    title: "Shared Actions Now Follow One Interaction System",
    body: "Primary shared actions now use the canonical Button patterns for focus rings, touch targets, and press feedback. Automated checks protect the common components while specialized controls keep shapes suited to their purpose.",
  },
  {
    date: "Jan 28, 2026",
    tag: "feature",
    title: "Warm Transfer Escalation",
    body: "When enabled and configured, a Bot can transfer a live caller to a human. Set the handoff destination and escalation rules in the Bot's configuration. The Bot gives a brief handoff before requesting the transfer. This feature is off by default.",
  },
  {
    date: "Jan 28, 2026",
    tag: "feature",
    title: "Escalation Routing for Each Bot",
    body: "Each Bot can route escalations to its designated person. Its phone and email settings override the workspace default when set. Email alerts require an explicit choice and identify BotBound.",
  },
  {
    date: "Jan 27, 2026",
    tag: "infra",
    title: "BotBound Runtime Monitoring",
    body: "BotBound now monitors calling and reasoning readiness behind the scenes with small, bounded checks. Issues that affect customers surface through BotBound product messaging and support.",
  },
  {
    date: "Jan 27, 2026",
    tag: "polish",
    title: "Public Pages Across Screen Sizes",
    body: "Landing, pricing, and trust pages share navigation and typography across screen sizes. Public product pages lead to account creation and private rehearsal. Pricing tools remain on /pricing.",
  },
  {
    date: "Jan 27, 2026",
    tag: "infra",
    title: "Visual QA Coverage",
    body: "Added automated screenshot capture and responsive layout auditing for critical routes and viewports so visual QA can be run before release.",
  },
  {
    date: "Jan 27, 2026",
    tag: "polish",
    title: "Sidebar Rail: Desktop Chrome Rebuild",
    body: "The horizontal top bar gave way to a resizable desktop rail with a compact mode, clear grouping, and an anchored account control. Mobile keeps a focused bottom dock for Studio, Inbox, Calls, and More.",
  },
  {
    date: "Jan 27, 2026",
    tag: "infra",
    title: "Voice Runtime Rebalanced for Reliability",
    body: "Structured reasoning now runs a managed primary policy with ordered continuity behind it, so a runtime issue degrades gracefully instead of failing a conversation. Authenticated Studio and ChatGPT rehearsals share the managed live voice path, while production phone calls keep their dedicated calling runtime.",
  },
  {
    date: "May 19, 2026",
    tag: "feature",
    title: "A Private Workspace and DM with Each Bot",
    body: 'Every Bot now has its own persistent chat thread. Coach your Bot in plain English ("be warmer on price objections"), ask how this week\'s calls went, or add context. Memory includes the thread and the last five call summaries with every reply.',
  },
];

const SORTED_ENTRIES = [...ENTRIES].sort(
  (left, right) => Date.parse(right.date) - Date.parse(left.date),
);

export default function PublicChangelog() {
  return (
    <>
      <PageMeta
        title="Changelog | BotBound"
        description="Every shipped improvement to BotBound: features, infrastructure, polish, security. Updated when we ship."
        path="/changelog"
      />
      <MarketingChrome stickyCta={false}>
        <div className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 pt-12 pb-8 sm:pt-16 sm:pb-12">
          <div className="mb-10">
            <h1 className="marketing-hero-title">What’s New</h1>
          </div>

          <ol className="space-y-6">
            {SORTED_ENTRIES.map((entry) => {
              const meta = TAG_META[entry.tag];
              const Icon = meta.icon;
              return (
                <li
                  key={`${entry.date}-${entry.title}`}
                  className="relative pl-4 sm:pl-6 marketing-panel-muted p-4 sm:p-5"
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-6 w-1.5 h-1.5 rounded-full bg-brand"
                  />
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="text-eyebrow">{entry.date}</span>
                    <span
                      className={`inline-flex items-center gap-1 text-eyebrow px-2 py-0.5 rounded-full border leading-none ${meta.tone}`}
                    >
                      <Icon className="w-2.5 h-2.5" strokeWidth={2.2} />
                      {meta.label}
                    </span>
                  </div>
                  <h2
                    className="font-display text-xl text-foreground leading-tight mb-1"
                    data-wireline-preserve-case={entry.title.includes("BotBound") || undefined}
                  >
                    {entry.title}
                  </h2>
                  <p className="marketing-body">{entry.body}</p>
                </li>
              );
            })}
          </ol>

          <div className="mt-12 pt-6 border-t border-border">
            <h2 className="mb-2 text-sm font-semibold">Under active evaluation</h2>
            <ul className="marketing-body space-y-1 list-disc pl-5">
              <li>Mobile controls for monitoring, coaching, and approvals on the go.</li>
              <li>Reusable workflow recipes with clearer review and publishing controls.</li>
              <li>Annual performance recaps built from each account's verified activity.</li>
            </ul>
            <p className="mt-3 text-caption">
              Roadmap items are not commitments; scope and timing may change as customer evidence
              improves.
            </p>
          </div>
        </div>
      </MarketingChrome>
    </>
  );
}
