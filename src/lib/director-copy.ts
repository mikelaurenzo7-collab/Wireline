/**
 * Director / fleet coach copy and capability catalog.
 * Visual styling: wireline-design-system.ts + design-system.css (Figma tokens).
 */

export type DirectorCapabilityCategory =
  | "strategy"
  | "create"
  | "execute"
  | "research"
  | "integrations"
  | "coach"
  | "creative";

export const DIRECTOR_CAPABILITY_CATEGORY_LABELS: Record<DirectorCapabilityCategory, string> = {
  strategy: "Strategy & ops",
  create: "Documents & copy",
  execute: "Outbound comms",
  research: "Live research",
  integrations: "Connected apps",
  coach: "Agent coaching",
  creative: "Brand & visuals",
};

export interface DirectorCapabilityItem {
  id: string;
  label: string;
  description: string;
  category: DirectorCapabilityCategory;
  /** Example operator utterance — sent when picked from catalog */
  example: string;
}

/** Full capability matrix — what clients can ask Director to do */
export const DIRECTOR_CAPABILITY_CATALOG: readonly DirectorCapabilityItem[] = [
  {
    id: "fleet-audit",
    label: "Fleet audit",
    description: "Cross-agent review with prioritized fixes",
    category: "strategy",
    example: "Audit my fleet — what should I fix first?",
  },
  {
    id: "weekly-priorities",
    label: "Weekly priorities",
    description: "Ops focus for the next 7 days from live call data",
    category: "strategy",
    example: "What should my team focus on this week based on recent calls?",
  },
  {
    id: "gtm-plan",
    label: "GTM one-pager",
    description: "Positioning, ICP, and channel plan for your offer",
    category: "strategy",
    example: "Draft a one-page GTM plan for my business",
  },
  {
    id: "business-plan",
    label: "Business plan",
    description: "Structured plan with goals, metrics, and milestones",
    category: "create",
    example: "Draft a one-page business plan for my company",
  },
  {
    id: "call-script",
    label: "Call script",
    description: "Opener, discovery, objection handling, close",
    category: "create",
    example: "Write a phone script for booking HVAC estimates",
  },
  {
    id: "email-sequence",
    label: "Email sequence",
    description: "Multi-touch follow-up with subject lines",
    category: "create",
    example: "Draft a 3-email follow-up sequence for missed calls",
  },
  {
    id: "sop",
    label: "SOP / playbook",
    description: "Step-by-step ops doc your team can run",
    category: "create",
    example: "Write an SOP for how agents should handle billing disputes",
  },
  {
    id: "outbound-call",
    label: "Place a call",
    description: "Outbound call draft — approve before dialing",
    category: "execute",
    example: "Call Jordan Lee back about tomorrow's estimate",
  },
  {
    id: "outbound-text",
    label: "Send a text",
    description: "SMS follow-up drafted for one-click send",
    category: "execute",
    example: "Text the lead we spoke with yesterday a booking link",
  },
  {
    id: "outbound-email",
    label: "Send email",
    description: "Transactional or follow-up email on approval",
    category: "execute",
    example: "Email the customer a summary of our call and next steps",
  },
  {
    id: "workflow",
    label: "Multi-step workflow",
    description: "CRM lookup → message → log — staged as steps",
    category: "execute",
    example: "Look up their Shopify order, text them the status, and log it in CRM",
  },
  {
    id: "competitor-scan",
    label: "Competitor scan",
    description: "Live web research with cited sources",
    category: "research",
    example: "Research competitors and pricing in my market",
  },
  {
    id: "regulatory",
    label: "Compliance lookup",
    description: "TCPA, FDCPA, industry rules — grounded search",
    category: "research",
    example: "What are the latest TCPA rules for outbound SMS to leads?",
  },
  {
    id: "crm-lookup",
    label: "CRM lookup",
    description: "Find contacts, deals, and log outcomes",
    category: "integrations",
    example: "Find this caller in HubSpot and summarize their deal stage",
  },
  {
    id: "shopify-order",
    label: "Shopify / Square",
    description: "Order status, inventory, returns, invoices",
    category: "integrations",
    example: "Look up order #1042 in Shopify and draft a status update",
  },
  {
    id: "slack-alert",
    label: "Slack / Teams alert",
    description: "Notify your team when something needs eyes",
    category: "integrations",
    example: "Post a Slack alert when a hot lead calls twice in one day",
  },
  {
    id: "coach-greeting",
    label: "Tune greeting",
    description: "Update agent opener and personality in one approval",
    category: "coach",
    example: "Make Ava's greeting warmer and mention same-day service",
  },
  {
    id: "coach-tools",
    label: "Toggle capabilities",
    description: "Turn integrations and tools on/off per agent",
    category: "coach",
    example: "Turn on calendar booking and SMS for my sales agent",
  },
  {
    id: "post-call",
    label: "Post-call coaching",
    description: "Review a recent call and propose script fixes",
    category: "coach",
    example: "Review Ava's last 5 calls and suggest script improvements",
  },
  {
    id: "logo",
    label: "Logo concepts",
    description: "Three on-brand concepts + vectorize / brand pack",
    category: "creative",
    example: "Generate 3 logo concepts for my home services brand",
  },
  {
    id: "call-review",
    label: "Call review",
    description: "Rank recent calls and propose script fixes",
    category: "coach",
    example: "Review my last 10 calls and tell me what to fix in scripts first",
  },
  {
    id: "pipeline-health",
    label: "Pipeline health",
    description: "Where leads stall and what to do next",
    category: "strategy",
    example: "Analyze my outbound pipeline — where are deals stalling?",
  },
  {
    id: "deep-dive",
    label: "Deep fleet dive",
    description: "Opus-level cross-fleet analysis (slower, sharper)",
    category: "strategy",
    example: "Do a deep dive on my fleet performance over the last 30 days",
  },
  {
    id: "book-meeting",
    label: "Book a meeting",
    description: "Calendar check + confirmation draft",
    category: "integrations",
    example: "Check my calendar availability Thursday afternoon and draft a booking confirmation",
  },
  {
    id: "enrich-lead",
    label: "Enrich a lead",
    description: "Apollo lookup + personalized opener",
    category: "integrations",
    example: "Enrich alex.rivera@northstarmfg.com with Apollo and draft a cold opener",
  },
  {
    id: "docusign-flow",
    label: "Send a contract",
    description: "DocuSign envelope draft on approval",
    category: "integrations",
    example: "Draft a standard NDA follow-up and prepare it for DocuSign",
  },
  {
    id: "landing-page",
    label: "Landing page copy",
    description: "Hero, proof, CTA sections for your offer",
    category: "create",
    example: "Write homepage hero and three sections for my HVAC company",
  },
  {
    id: "code-snippet",
    label: "Code & automation",
    description: "TypeScript, SQL, scripts — copy from fenced blocks",
    category: "create",
    example:
      "Write a TypeScript Express route with Zod validation that accepts a lead intake payload",
  },
  {
    id: "objection-matrix",
    label: "Objection matrix",
    description: "Price, timing, competitor responses",
    category: "create",
    example: "Build an objection handling matrix for price, timing, and competition",
  },
  {
    id: "analyze-pdf",
    label: "Analyze a document",
    description: "Summarize an attached PDF and extract action items",
    category: "create",
    example:
      "I attached our service agreement — summarize risks and suggested agent talking points",
  },
] as const;


export type ComposerAccessoryKind =
  | "connectors"
  | "capabilities"
  | "coach"
  | "tools"
  | "attach";

export const DIRECTOR_COMPOSER_ACCESSORY_HINTS: Record<ComposerAccessoryKind, string> = {
  connectors: "Connector lanes your fleet can orchestrate through Assistant",
  capabilities: "Tap a skill — example prompt lands in the composer",
  coach: "Route this thread through one agent's memory and tools",
  tools: "Abilities currently armed for the coached agent",
  attach: "Documents, fleet context rules, or playbook instructions",
};


export type DirectorStreamPhase = "connecting" | "preparing" | "thinking" | "replying" | "done";

export const DIRECTOR_PHASE_COPY: Record<DirectorStreamPhase, { headline: string; sub: string }> = {
  connecting: {
    headline: "Opening fleet coach",
    sub: "Secure channel to your fleet co-pilot",
  },
  preparing: {
    headline: "Loading fleet context",
    sub: "Thread history · integrations · operator intent",
  },
  thinking: {
    headline: "Working the problem",
    sub: "Fleet context · integrations · operator intent",
  },
  replying: {
    headline: "Packaging your co-pilot reply",
    sub: "Actions, approvals, and deliverables",
  },
  done: {
    headline: "Locking in response",
    sub: "Almost ready for your review",
  },
};

export function directorPhaseCopy(input: {
  phase: DirectorStreamPhase;
  isDeep?: boolean;
  coachAgentName?: string | null;
}): { headline: string; sub: string } {
  const base = DIRECTOR_PHASE_COPY[input.phase];
  if (input.phase === "thinking" && input.isDeep) {
    return {
      headline: "Deep fleet analysis",
      sub: "Cross-agent strategy · Opus reasoning",
    };
  }
  if (input.coachAgentName && input.phase === "thinking") {
    return {
      headline: `Coaching ${input.coachAgentName}`,
      sub: "Config · capabilities · live call context",
    };
  }
  return base;
}

export interface DirectorStarterPrompt {
  id: string;
  label: string;
  /** Shown as micro-caption on hover / accessibility */
  intent: string;
}

/** Empty-state chips — intrigue without generic AI fluff */
export const DIRECTOR_STARTER_PROMPTS: readonly DirectorStarterPrompt[] = [
  {
    id: "first-agent",
    label: "What agent should I hire first?",
    intent: "Fleet planning for new operators",
  },
  {
    id: "sales-setup",
    label: "Set up a sales agent for my business",
    intent: "Guided deploy + GTM",
  },
  {
    id: "fleet-audit",
    label: "Audit my fleet — what should I fix first?",
    intent: "Deep fleet review",
  },
  {
    id: "business-plan",
    label: "Draft a one-page plan for my company",
    intent: "In-chat deliverable",
  },
  {
    id: "market-research",
    label: "Research competitors and pricing in my market",
    intent: "Live web intel via grounded search",
  },
  {
    id: "outbound-sequence",
    label: "Build a follow-up sequence for missed calls",
    intent: "Multi-touch comms + scripts",
  },
  {
    id: "support-playbook",
    label: "Write a support playbook for angry callers",
    intent: "SOP + escalation paths",
  },
  {
    id: "logo-brand",
    label: "Generate logo concepts for my brand",
    intent: "Creative approval flow",
  },
  {
    id: "post-call-coach",
    label: "Review recent calls and coach my agents",
    intent: "Fleet coaching from call history",
  },
  {
    id: "collections",
    label: "Help me set up compliant collections outreach",
    intent: "FDCPA-aware comms planning",
  },
] as const;

/** Featured count on Director empty state — rest collapse behind "More prompts" */
export const DIRECTOR_STARTER_PROMPTS_FEATURED_COUNT = 4;

export const DIRECTOR_CAPABILITY_PILLS = [
  { id: "voice", label: "Voice" },
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
  { id: "documents", label: "Documents" },
  { id: "code", label: "Code" },
  { id: "research", label: "Research" },
  { id: "crm", label: "CRM" },
  { id: "integrations", label: "Integrations" },
  { id: "creative", label: "Creative" },
] as const;

export const DIRECTOR_LOADING_COPY = {
  headline: "Opening fleet coach",
  sub: "Thread history · fleet context · integrations",
} as const;

export const DIRECTOR_EMPTY_HERO = {
  eyebrow: "Fleet coach",
  title: "Orchestrate your fleet from",
  titleAccent: "one console",
  subtitleWithFleet: (n: number) =>
    `${n} agent${n === 1 ? "" : "s"} on deck — orchestrate calls, comms, and integrations from one thread.`,
  subtitleNoFleet:
    "Plan your fleet, research your market, coach agents, and run CRM work — before agent #1 goes live.",
  capabilityEyebrow: "One console for",
  starterEyebrow: "Start here",
  discoverEyebrow: "Explore capabilities",
  morePromptsLabel: "More prompts",
  fewerPromptsLabel: "Show fewer",
} as const;

/** Agent workspace empty-state chips — parity with Director discovery */
export const AGENT_WORKSPACE_STARTER_PROMPTS: readonly DirectorStarterPrompt[] = [
  {
    id: "review-calls",
    label: "Review my last few calls",
    intent: "Call history coaching",
  },
  {
    id: "objection",
    label: "Help me handle price objections",
    intent: "Objection handling",
  },
  {
    id: "opening-script",
    label: "Tighten my opening script",
    intent: "Script refinement",
  },
] as const;

export const DIRECTOR_LIVE_STEP_COPY = {
  contextCoach: (name: string) => `Loading ${name} coaching context`,
  contextFleet: (n: number) =>
    n > 0 ? `Scanning ${n} agent${n === 1 ? "" : "s"} in fleet` : "Reading your business setup",
  contextSub: "Thread history · settings · recent calls",
  integrationsOn: "Arming connected integrations",
  integrationsOnSub: "Shopify · CRM · Slack · calendar paths",
  integrationsOff: "Core co-pilot mode",
  integrationsOffSub: "Strategy · docs · orchestration — no OAuth required",
  executeTitle: "Staging approval cards",
  executeSub: "Calls · texts · emails · integration jobs",
  composeCoach: "Tailoring coach recommendations",
  composeFleet: "Composing co-pilot response",
  composeSub: "Clear · actionable · ready to approve",
} as const;

export const LIVE_FEED_LABELS = {
  scripted: "Live integrations",
  proposal: "Proposed workflow",
  proposalHint: "Approve below to execute — nothing runs until you confirm.",
  proposalCount: (n: number) =>
    n === 1 ? "1 action awaiting approval" : `${n} actions awaiting approval`,
  researchEyebrow: "Grounded web sources",
} as const;

/** Turn Ledger — per-message activity summary + stratum copy */
export const DIRECTOR_TURN_LEDGER_COPY = {
  reasoningEyebrow: "Reasoning",
  deepReasoningEyebrow: "Deep analysis",
  actionsEyebrow: "Mission log",
  sourcesEyebrow: "Grounded web sources",
  summaryReasoned: (seconds: string) => `Reasoned ${seconds}`,
  summaryActions: (n: number) => (n === 1 ? "1 action" : `${n} actions`),
  summarySources: (n: number) => (n === 1 ? "1 source" : `${n} sources`),
  summaryProposals: (n: number) => (n === 1 ? "1 proposal" : `${n} proposals`),
  actionFailedPrefix: "Failed —",
  actionDetailToggle: "Show detail",
  actionDetailHide: "Hide detail",
  actionKindLabels: {
    research: "Research",
    tool: "Tool",
    deep: "Deep analysis",
    design: "Design",
    retry: "Recovery",
    compose: "Compose",
  },
} as const;

/** Director thread / session management copy */
export const DIRECTOR_SESSION_COPY = {
  applySaved: (label: string) => `${label} saved to agent — safe to clear thread`,
  applyAllLabel: "Apply all",
  applyAllProgress: (done: number, total: number) => `Applying ${done} of ${total}…`,
  applyAllSuccess: (n: number) =>
    n === 1 ? "1 agent update applied" : `${n} agent updates applied`,
  applyAllPartial: (applied: number, failed: number) =>
    `${applied} applied · ${failed} failed — retry remaining cards individually`,
  clearSuccess: "Thread cleared",
  clearSuccessDetail: "Chat and artifacts removed. Applied agent settings were kept.",
  pendingApprovals: (n: number) => (n === 1 ? "1 approval pending" : `${n} approvals pending`),
  sessionHint:
    "Applied agent settings persist on each agent. Unapproved cards and chat history are removed when you clear.",
  degradedNotice: "Some Assistant data could not be loaded. Your thread may be incomplete.",
  degradedRetryLabel: "Retry",
} as const;

/** Copy for DirectorLiveOrchestra — fleet channel / runway / spotlight */
export const LIVE_ORCHESTRA_COPY = {
  eyebrow: "Fleet channel",
  armSequence: "Arming integration sequence…",
  armNext: "Next on the runway",
  queuedPrefix: "Queued:",
  clearedSummary: (n: number) =>
    n === 1 ? "1 action cleared · packaging reply" : `${n} actions cleared · packaging reply`,
  liveNow: "Live",
  spotlightLive: "Executing now",
  spotlightLast: "Last signal",
  spotlightNext: "On deck",
  queueLabel: "Up next",
  clearedLabel: "Cleared",
} as const;

/** Group catalog items by category for UI accordions */
export function directorCapabilitiesByCategory(): Record<
  DirectorCapabilityCategory,
  DirectorCapabilityItem[]
> {
  const grouped = {} as Record<DirectorCapabilityCategory, DirectorCapabilityItem[]>;
  for (const cat of Object.keys(
    DIRECTOR_CAPABILITY_CATEGORY_LABELS,
  ) as DirectorCapabilityCategory[]) {
    grouped[cat] = [];
  }
  for (const item of DIRECTOR_CAPABILITY_CATALOG) {
    grouped[item.category].push(item);
  }
  return grouped;
}
