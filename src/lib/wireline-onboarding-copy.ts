/**
 * Post-signup onboarding copy — Account Holder-facing, Wireline-native.
 */

import { getSignupWedgeRecommendation } from "./signup-intent";

export const ONBOARDING_WELCOME = {
  eyebrow: "Welcome aboard",
  title: "Get to your first",
  titleAccent: "real call",
  subtitle:
    "Wireline wins when a customer reaches your agent on a live line. Fast Setup gets you provisioned — then we help you land that first useful conversation.",
  bullets: [
    { label: "Agent", detail: "Name, role, and starting brief generated from your description" },
    { label: "Training", detail: "Optional website scrape plus sources, documents, and policies" },
    {
      label: "Activate",
      detail: "Provision a US line, dial in, and complete one real conversation",
    },
  ],
  ctaPrimary: "Start Fast Setup",
  ctaSecondary: "Explore Studio",
  timeHint: "~3 min setup",
} as const;

export function onboardingWelcomeSubtitle(signupWedge: string | null): string {
  const rec = getSignupWedgeRecommendation(signupWedge);
  if (!rec) return ONBOARDING_WELCOME.subtitle;
  return `Matched for ${rec.label}: we'll start from the ${rec.templateLabel} template. ${ONBOARDING_WELCOME.subtitle}`;
}

/** Replaces the old auto Product Tour — shown once after Fast Start completes. */
export const CONSOLE_MAP = {
  sectionTitle: "Your workspace",
  items: [
    {
      id: "overview",
      label: "Overview",
      detail: "Agents, metrics, and your daily brief",
      path: "/overview",
    },
    {
      id: "call-logs",
      label: "Call logs",
      detail: "Live callers, recaps, and follow-up in motion",
      path: "/call-logs",
    },
    {
      id: "studio",
      label: "Studio",
      detail: "Chat-first run surface for calls, texts, and handoff",
      path: "/studio",
    },
    {
      id: "insights",
      label: "Insights",
      detail: "Call scores, topics, trends, and reliability",
      path: "/insights",
    },
  ],
} as const;

/** Editorial panel on auth — first impression before the Account Holder console. */
export const AUTH_PORTAL_SHOWCASE = {
  eyebrow: "Account workspace",
  title: "Mission control for your",
  titleAccent: "Wireline agents",
  subtitle:
    "Wireline runs phone, email, and SMS agents on real numbers — trained on your playbook and supervised from one calm workspace.",
  features: [
    {
      id: "studio",
      label: "Training",
      detail: "Shape voice, behavior, documents, and policy before anything goes live.",
    },
    {
      id: "director",
      label: "Studio",
      detail: "Run calls, texts, approvals, and handoff in one chat-first workroom.",
    },
    {
      id: "live-ops",
      label: "Recaps floor",
      detail: "Listen in, approve CRM writes, and monitor live work in real time.",
    },
  ],
} as const;

export const YOURE_LIVE_COPY = {
  eyebrow: "Agent live",
  title: "You're live",
  subtitle: (agentName: string) => `${agentName} is ready to take calls.`,
  nextLabel: "What to do next",
  testCallTitle: "Run a browser test call",
  testCallDetail: "Hear your agent without dialing — tune tone and script in Studio.",
  testCallAction: "Open Studio",
  opsTitle: "Watch call logs",
  opsDetail: "See active callers, approve actions, and monitor live work.",
  opsAction: "Open call logs",
} as const;

/** Shown after Fast Start — agent exists but activation (first useful call) pending. */
export const ACTIVATION_PENDING_COPY = {
  eyebrow: "One step left",
  title: "Make your first",
  titleAccent: "real call",
  subtitle: (agentName: string) =>
    `${agentName} is provisioned. Dial your line from your phone — activation counts when a customer-quality conversation completes.`,
  phoneLabel: "Your live number",
  dialCta: "Call now to activate",
  browserTestTitle: "Browser test (optional)",
  browserTestDetail:
    "Preview voice and script in Studio — simulator calls do not count toward activation.",
  browserTestAction: "Open Studio",
  opsTitle: "Watch Recaps",
  opsDetail: "See the call land in real time once you dial in.",
  opsAction: "Open Recaps",
} as const;

/** Full celebration after first useful production call. */
export const ACTIVATION_COMPLETE_COPY = {
  eyebrow: "Activated",
  title: "First live call",
  titleAccent: "complete",
  subtitle: (agentName: string) =>
    `${agentName} just handled a real customer conversation. You're officially live.`,
  nextLabel: "What to do next",
} as const;

export const ACTIVATION_NUDGE_COPY = {
  eyebrow: "Activation",
  body: "Dial your line for a real conversation — that's when Wireline counts you as live.",
  cta: "Call to activate",
} as const;

/** Guided steps after Fast Start create — Create → Train → Wire → Test. */
export const POST_CREATE_WIZARD_COPY = {
  eyebrow: "Fast Start",
  title: "Next up for",
  steps: {
    train: {
      label: "Train",
      title: "Review what your agent learned",
      detail:
        "Your opening brief is already in Training. Add a site, document, or policy before you go live.",
      primary: "Open Training",
      secondary: "Looks good — continue",
    },
    wire: {
      label: "Wire",
      title: "Connect a live line",
      detail:
        "Provision a US number so callers reach this agent. Conversation Balance or a paid plan is required.",
      primary: "Provision number",
      skip: "Wire later",
      activationRequired:
        "Fund live work or choose shared capacity to provision a number — use the activation prompt to continue.",
    },
    test: {
      label: "Test",
      title: "Hear your agent",
      detail:
        "Run a private browser test — simulator calls do not count toward activation. Dial your line when you're ready for a real call.",
      primary: "Finish setup",
    },
  },
  complete: {
    wiredTitle: "You're wired",
    wiredDetail: (agentName: string, phone: string) =>
      `${agentName} is on ${phone}. Dial from your phone when you're ready — that's activation.`,
    deferredTitle: "Agent ready in Studio",
    deferredDetail: (agentName: string) =>
      `${agentName} is trained and waiting. Wire a number under Settings → Phone when you're ready to go live.`,
    studioCta: "Continue in Studio",
    phoneCta: "Phone settings",
  },
} as const;
