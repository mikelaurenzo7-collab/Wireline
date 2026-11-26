/**
 * Post-signup onboarding copy — Account Holder-facing, BotBound-native.
 * Public marketing uses capability and outcome copy, without a setup sequence.
 * After create, the setup guide is Train → Voice → Rehearse → Launch.
 */

/** Shown after Fast Start — Bot exists but activation (first useful call) pending. */
export const ACTIVATION_PENDING_COPY = {
  eyebrow: "One step left",
  title: "Make Your First",
  titleAccent: "Real Call",
  subtitle: (agentName: string) =>
    `${agentName} has a number. Call it to check the greeting, answers, and conversation.`,
  phoneLabel: "Your live number",
  dialCta: "Call your Bot",
  browserTestTitle: "Private rehearsal (optional)",
  browserTestDetail: "Hear your Bot's voice and answers in Set Up without calling the number.",
  browserTestAction: "Open Set Up",
  opsTitle: "Watch Calls",
  opsDetail: "See the call land in real time once you dial in.",
  opsAction: "Open Calls",
} as const;

export const ACTIVATION_NUDGE_COPY = {
  eyebrow: "First call",
  body: "Try a call to check your Bot's greeting and answers.",
  cta: "Call your Bot",
} as const;

/** Guided steps after create — Knowledge → Voice → Rehearse → Launch. */
export const POST_CREATE_WIZARD_COPY = {
  eyebrow: "Setup",
  title: "Next Up for",
  steps: {
    train: {
      label: "Knowledge",
      title: "Teach It the Job",
      detail: "Review its instructions. Add a site, document, or policy when needed.",
      salesHint:
        "Teach it what matters on day one, hear it privately, then put it on a live number.",
      primary: "Open Knowledge",
      secondary: "Choose Voice",
    },
    voice: {
      label: "Voice",
      title: "Choose Voice",
      detail: "Pick a voice or clone your own. Change it anytime.",
      primary: "Continue to Rehearse",
    },
    launch: {
      label: "Launch",
      title: "Put It on the Line",
      detail: "Connect a dedicated number so callers can reach this Bot directly.",
      primary: "Choose a Number",
      skip: "Launch Later",
    },
    test: {
      label: "Rehearse",
      title: "Hear It First",
      detail:
        "Practice privately with your built-in voice. To hear a cloned voice in a conversation, connect a number and make a real test call.",
      primary: "Continue to Launch",
      skip: "Skip Rehearsal",
    },
  },
  complete: {
    liveTitle: "It's on the Line",
    liveDetail: (agentName: string, phone: string) =>
      `${agentName} is on ${phone}. Dial from your phone when you're ready.`,
    deferredTitle: "Ready When You Are",
    deferredDetail: (agentName: string) =>
      `${agentName} is saved. Connect a number under Phone when you want it live.`,
    studioCta: "Continue in Workspace",
    phoneCta: "Get a Number",
  },
} as const;

/**
 * Phone setup, post-create, and Preview Voice fallback shown only when the server
 * reports self-serve checkout closed or the plan catalog cannot be reached (fail
 * closed). With paid checkout open it never renders, so it must not imply that
 * BotBound itself is paused.
 */
export const SOFT_OPEN_CHECKOUT_COPY = {
  title: "Live activation isn't available right now",
  detail: "Keep trying your Bot privately in Set Up, then check back soon.",
  allowanceDetail: "This month's Preview Voice is used. We'll restore it when you go live.",
  cta: "Contact support",
  href: "/contact?topic=billing",
} as const;
