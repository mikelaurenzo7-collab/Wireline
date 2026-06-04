/**
 * /changelog — public deploy history.
 *
 * Pre-launch trust signal: prospects want proof we ship. A live
 * changelog with weekly entries beats every other "we move fast"
 * claim on the marketing pages.
 *
 * Format: reverse-chronological. Each entry has a date, a tag
 * (feature / fix / polish / infra), and a one-paragraph summary.
 * Entries are hand-curated from the commit history — NOT every
 * commit shows up, just the customer-facing wins.
 *
 * Keep entries concrete: name the thing, name the win. "Faster"
 * isn't a changelog entry; "TopBar fits at 1280px laptops" is.
 */
import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { PageMeta } from "../lib/page-meta";

type Tag = "feature" | "fix" | "polish" | "infra";

interface Entry {
  date: string;
  tag: Tag;
  title: string;
  body: string;
}

const TAG_META: Record<Tag, { label: string; color: string; bg: string }> = {
  feature: { label: "FEATURE", color: "#8B3FD6", bg: "rgba(107, 43, 153, 0.10)" },
  fix: { label: "FIX", color: "#8B3FD6", bg: "rgba(107, 43, 153, 0.10)" },
  polish: { label: "POLISH", color: "#7B3FAE", bg: "rgba(123, 63, 174, 0.10)" },
  infra: { label: "INFRA", color: "#7C7469", bg: "rgba(124, 116, 105, 0.10)" },
};

const ENTRIES: Entry[] = [
  {
    date: "Jan 27, 2026",
    tag: "infra",
    title: "Voice tiering rebalanced — Sonnet 4.6 live, Opus 4.7 brain",
    body: "End-to-end caller dead air dropped from ~2 s to ~700–900 ms. The live voice runtime now runs Claude Sonnet 4.6 (TTFT 300–500 ms against our 18 KB system prompt); Claude Opus 4.7 powers every off-wire path — pre-call briefs, post-call analysis, daily brief, coaching — where the user isn't waiting. Same agent moat, faster wire.",
  },
  {
    date: "Jan 27, 2026",
    tag: "infra",
    title: "/api/health/models — live LLM canary",
    body: "New auth-gated endpoint pings every configured Claude tier with a 1-token probe and reports {ok, latency_ms, error} per layer. Catches the silent failure mode where a model id drifts away from what Anthropic actually serves. Wired to the in-app System Status panel and ready for external uptime monitors.",
  },
  {
    date: "Jan 27, 2026",
    tag: "infra",
    title: "Pricing & model docs now CI-enforced",
    body: "scripts/check-readme-pricing.mjs runs on every npm run verify and fails the build if the README pricing table drifts from src/lib/plan-catalog.ts. The class of bug where marketing said one number and billing charged another is now structurally impossible.",
  },
  {
    date: "Jan 27, 2026",
    tag: "infra",
    title: "Agent moat behind a safety net",
    body: "agent-runtime.ts, personality-vibes.ts, claude-models.ts, plan-catalog.ts — the four files that actually define the product — now have dedicated unit tests (115 total tests, 10 test files). TypeScript strict-mode allowlist doubled (8 → 16 files). A silent edit to a personality vibe or a tiering constant now fails CI instead of shipping.",
  },
  {
    date: "May 19, 2026",
    tag: "feature",
    title: "Per-agent Workspace — private DM with each AI employee",
    body: 'Every agent now has its own persistent chat thread. Coach the agent in plain English ("be warmer on price objections"), ask how this week\'s calls went, give context. Memory model: the thread itself + the last 5 call summaries injected as context on every reply. Available on every paid tier — open any agent under Chat.',
  },
  {
    date: "May 19, 2026",
    tag: "feature",
    title: "/for/personal wedge — phone-anxious consumers welcome",
    body: "Not every Wireline user is a business. Plenty of people would pay $49/mo to never make another awkward call themselves — debt negotiation, doctor appointments, returns, billing disputes. The /for/personal landing page leads with that audience: ADHD, autism, social anxiety, time-pressed adults. Same product, different framing.",
  },
  {
    date: "May 19, 2026",
    tag: "fix",
    title: 'Showcase agents no longer say "S-M-S" letter by letter',
    body: 'Our voice engine was reading "SMS" as letters (S-M-S) which sounded choppy on calls. Every caller-facing reference to "SMS" in the agent prompts → "text message". Sounds human. All 10 showcase agents (Sarah, Liam, Tyler, Maya, Devon, Priya, Marcus, Aisha, Elena, Jake) re-synced.',
  },
  {
    date: "May 19, 2026",
    tag: "polish",
    title: "TopBar fits on every laptop viewport",
    body: 'Nav labels hide below 1536px so icons + avatar dropdown + system status fit at common ThinkPad / MacBook Air widths. Sign-out is now in the avatar dropdown (top right circle), not buried as a tiny icon. Pipeline columns also resized so 6 stages fit at 1280px without the rightmost "Lost" column getting clipped.',
  },
  {
    date: "May 19, 2026",
    tag: "feature",
    title: "Operator-alert text messages — agents text YOU when stuff happens",
    body: "Wireline can now text your phone when an agent escalates a call, a webhook delivery fails, or other notable events fire. Toggle it on in Admin → Carrier → Alerts to you. Standard messaging rates apply; ~5 alerts/day/agent ceiling so it never feels noisy.",
  },
  {
    date: "May 19, 2026",
    tag: "polish",
    title: 'Showcase demo agents — "off" background sound, clean studio line',
    body: 'The default "office" ambient track on showcase agents was outing them as not-quite-human at current voice quality. Switched all 10 demo agents to a quiet studio line. Sounds like a real headset call, not a fake bullpen.',
  },
  {
    date: "May 19, 2026",
    tag: "fix",
    title: "Trial-start celebratory moment",
    body: 'Click the magic link in your verification email → land back on Wireline → see an explicit "Trial started · 14 days · 1 agent · 25 outbound calls included" toast. Previously the verification was silent — felt anticlimactic right when you were most invested.',
  },
  {
    date: "May 18, 2026",
    tag: "feature",
    title: "Mobile bottom-sheet modals",
    body: "Trial gates, confirm dialogs, and deploy-agent modals now slide up from the bottom on phones (iOS-native pattern) instead of being centered cards. Easier one-handed dismiss. Desktop unchanged.",
  },
  {
    date: "May 18, 2026",
    tag: "fix",
    title: "Identical errors no longer stack 5-deep",
    body: "Toast notifications now deduplicate — if a fetch retry fires the same error 5 times, you see one toast with a refreshed timer, not five stacked toasts in the corner.",
  },
  {
    date: "May 18, 2026",
    tag: "polish",
    title: "Warm-wl-panel uniformity across the auth canvas",
    body: "Glass surfaces previously layered pure-white over the warm-paper background. Cards looked white on the auth'd console pages because so much of the viewport is cards. Shifted to a warm-cream tint so the operator canvas matches the marketing terracotta.",
  },
  {
    date: "May 17, 2026",
    tag: "feature",
    title: "Workflow composer — autosave + dirty warning + word-count hints",
    body: "Edit a stage's instructions → 3 seconds idle → autosaves silently. Try to leave with unsaved changes → browser warns you. Live word-count below each stage editor with target range (30-150 words) and pacing estimate. Mobile-responsive: tab toggle between Steps and Editor on phones.",
  },
  {
    date: "May 17, 2026",
    tag: "feature",
    title: "Agents learn from their own best calls",
    body: "Lesson ingestion now JOINs to callLogs.qa_score and only re-injects lessons from calls scoring ≥70. A bad call's takeaway no longer poisons the next call's instructions. Outcome ranking too — lessons from booked / qualified / info-only calls weighted in that priority order.",
  },
  {
    date: "May 17, 2026",
    tag: "feature",
    title: "Caller-history sentiment continuity",
    body: "If the last call with a given caller ended on a negative sentiment, the next call gets an empathy-shift directive injected automatically: more patience, no humor, faster resolution path. Restores the relationship instead of starting from scratch.",
  },
  {
    date: "May 14, 2026",
    tag: "infra",
    title: "Signup endpoint rate-limited",
    body: "3 attempts / 15 minutes per IP. A bot can no longer flood /api/auth/signup and burn through email-verification quota.",
  },
];

export function ChangelogPage() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <PageMeta
        title="Changelog — Wireline"
        description="Wireline's deploy history. Features, fixes, polish, infra — what shipped, when, and why."
        path="/changelog"
      />
      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-10 sm:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-muted hover:text-ink transition-colors mb-10 -mx-2 px-2 py-2 rounded-md hover:bg-black/[0.03]"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to app
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-md flex items-center justify-center shrink-0"
            style={{ background: "#8B3FD6" }}
          >
            <Sparkles className="w-5 h-5 text-on-brand" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Changelog</h1>
        </div>
        <p className="text-[12px] text-muted leading-relaxed mb-10 max-w-2xl">
          What we shipped recently. We don't show every commit — just the things that change how
          Wireline works for you. New entries land weekly.
        </p>

        <div className="space-y-7">
          {ENTRIES.map((entry, i) => {
            const meta = TAG_META[entry.tag];
            return (
              <article key={i} className="pb-7 border-b border-black/8 last:border-b-0">
                <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                  <span
                    className="text-[9px] font-semibold tracking-[0.25em] px-2 py-0.5 rounded"
                    style={{ color: meta.color, background: meta.bg }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-muted">
                    {entry.date}
                  </span>
                </div>
                <h2 className="font-display italic text-xl text-ink mb-2 leading-snug">
                  {entry.title}
                </h2>
                <p className="text-[13px] text-ink/75 leading-relaxed">{entry.body}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-12 pt-7 border-t border-black/8">
          <p className="text-[11px] text-muted leading-relaxed">
            Want something specific? Email{" "}
            <a href="mailto:trywireline@yahoo.com" className="text-brand hover:underline">
              trywireline@yahoo.com
            </a>{" "}
            or call (630) 581-1834 — Liam answers 24/7.
          </p>
        </div>
      </div>
    </div>
  );
}
