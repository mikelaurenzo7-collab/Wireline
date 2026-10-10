/**
 * PublicChangelog.tsx — public-facing changelog at /changelog.
 */
import { motion } from "motion/react";
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
    date: "Aug 17, 2026",
    tag: "infra",
    title: "Production Phone Calls Use a Dedicated Carrier-Grade Path",
    body: "Live inbound and outbound calls run through BotBound's managed calling stack. Marketing answering machines hang up without a message, unreachable campaign dials retry until the attempt budget, and a spoken stop-calling request ends the call immediately. Rollback paths remain isolated from customer traffic.",
  },
  {
    date: "Aug 11, 2026",
    tag: "launch",
    title: "Deeper Release Checks Before Anything Ships",
    body: "Every release now clears a wider battery of automated checks: code quality, dependency advisories, the non-E2E test suite, and database safety. Post-promotion health checks verify the live service, and demo or test activity stays strictly separate from real customer evidence.",
  },
  {
    date: "Jul 25, 2026",
    tag: "infra",
    title: "One Managed Reasoning Policy Across Demos and Studio",
    body: "Structured reasoning and every live-voice demo surface (Studio, private simulation, guest previews) now run on a single managed policy with governed continuity layers behind it, so behavior is consistent everywhere you try a Bot. Production phone calling keeps its own dedicated, carrier-grade runtime. Demo surfaces never take over customer calls.",
  },
  {
    date: "Jul 13, 2026",
    tag: "feature",
    title: "Fast Start Turns a Blank Workspace into a First Working Bot",
    body: "New workspaces now open directly into a focused two-step setup with a recommended voice already selected. After creation, BotBound guides the owner through review, number connection, and one real phone call instead of dropping them into an empty workspace.",
  },
  {
    date: "Jul 13, 2026",
    tag: "security",
    title: "Launch-Integrity Pass Across Exports, Messaging, and Voice",
    body: "Account exports now include tenant-scoped historical training records without exposing them to browser roles. Inbound text retries are idempotent, internal database helpers are no longer public RPCs, and voice previews use the exact supported voice with clear recovery when a sample is unavailable.",
  },
  {
    date: "Jun 4, 2026",
    tag: "security",
    title: "OAuth Sign-In Store Sealed Off from the Data API",
    body: "A security review closed direct data-API access to the short-lived OAuth bridge used during sign-in. Row-level security, explicit grants, and related tenant-policy checks now keep that flow inside the server-owned callback path.",
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
    body: "On tall desktop monitors the left navigation rail floated its items in the vertical middle, leaving an awkward gap under Search. Items now anchor directly beneath Search with a consistent rhythm and clean group separators, scaling identically from a 13-inch laptop to a 27-inch display.",
  },
  {
    date: "Jun 4, 2026",
    tag: "polish",
    title: "Shared Actions Now Follow One Interaction System",
    body: "Primary shared actions now use the canonical Button patterns for focus rings, touch targets, and press feedback. Automated checks protect the common components while the remaining specialized controls keep their purpose-built shapes.",
  },
  {
    date: "Jan 28, 2026",
    tag: "feature",
    title: "Warm-Transfer Escalation",
    body: "Every Bot can now warm-transfer a live caller to a human mid-call when it escalates. Configure immediate-escalation triggers in Bot Studio. The Bot speaks a brief handoff line, then transfers the call to the configured phone. Off by default. Explicit opt-in.",
  },
  {
    date: "Jan 28, 2026",
    tag: "feature",
    title: "Per-Agent Escalation Routing",
    body: "Sales Bots can now route their escalations to the sales lead; support Bots to the support lead. Bot-level escalation phone and email settings override the workspace default when set. Email alerts are opt-in and BotBound branded.",
  },
  {
    date: "Jan 27, 2026",
    tag: "infra",
    title: "BotBound Runtime Monitoring",
    body: "BotBound now monitors calling and reasoning readiness behind the scenes with small, bounded checks. Customer-impacting issues surface through BotBound product messaging and support.",
  },
  {
    date: "Jan 27, 2026",
    tag: "polish",
    title: "Marketing Surface + Mobile-First Public Pages",
    body: "Unified navigation, typography, and conversion rails across landing, pricing, demos, and trust pages. The live Bot directory supports tap-to-dial rows on mobile. Pricing tools remain on /pricing only.",
  },
  {
    date: "Jan 27, 2026",
    tag: "infra",
    title: "Visual QA Coverage",
    body: "Added automated screenshot capture and responsive-layout auditing for critical routes and viewports so visual QA can be run before release.",
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
    body: "Structured reasoning now runs a managed primary policy with ordered continuity behind it, so a runtime issue degrades gracefully instead of failing a conversation. Authenticated Studio and ChatGPT rehearsals share the managed live-voice path, while production phone calls keep their dedicated calling runtime.",
  },
  {
    date: "May 19, 2026",
    tag: "feature",
    title: "Per-Bot Workspace: A Private DM with Each Bot",
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
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mb-10"
          >
            <h1 className="marketing-hero-title text-3xl sm:text-4xl">
              Every Change We've Shipped
            </h1>
          </motion.div>

          <ol className="space-y-6">
            {SORTED_ENTRIES.map((entry, idx) => {
              const meta = TAG_META[entry.tag];
              const Icon = meta.icon;
              return (
                <motion.li
                  key={`${entry.date}-${entry.title}`}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{
                    duration: 0.4,
                    delay: Math.min(idx * 0.04, 0.4),
                  }}
                  className="relative pl-4 sm:pl-6 marketing-panel-muted p-4 sm:p-5"
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-6 w-1.5 h-1.5 rounded-full bg-brand"
                  />
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="text-eyebrow !text-[0.625rem]">{entry.date}</span>
                    <span
                      className={`inline-flex items-center gap-1 text-eyebrow !text-[0.625rem] px-2 py-0.5 rounded-full border leading-none ${meta.tone}`}
                    >
                      <Icon className="w-2.5 h-2.5" strokeWidth={2.2} />
                      {meta.label}
                    </span>
                  </div>
                  <h2 className="font-display text-xl text-foreground leading-tight mb-1">
                    {entry.title}
                  </h2>
                  <p className="marketing-body">{entry.body}</p>
                </motion.li>
              );
            })}
          </ol>

          <div className="mt-12 pt-6 border-t border-border">
            <p className="text-eyebrow mb-2">Under active evaluation</p>
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
