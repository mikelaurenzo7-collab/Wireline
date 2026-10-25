/**
 * Post-signup onboarding copy — Account Holder-facing, BotBound-native.
 * Public marketing uses capability and outcome copy, without a setup sequence.
 * After create, the setup guide is Train → Voice → Try It → Launch.
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
  browserTestTitle: "Try It in Your Browser (Optional)",
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

/** Guided steps after create — Train → Voice → Try It → Launch. */
export const POST_CREATE_WIZARD_COPY = {
  eyebrow: "Setup",
  title: "Next Up for",
  steps: {
    train: {
      label: "Train",
      title: "Teach It the Job",
      detail: "Review its instructions. Add a site, document, or policy when needed.",
      salesHint: "Train what matters on day one, hear it privately, then put it on a live number.",
      primary: "Open training",
      secondary: "Choose Voice",
    },
    voice: {
      label: "Voice",
      title: "Choose Voice",
      detail: "Pick a voice or clone your own. Change it anytime.",
      primary: "Continue to Try It",
    },
    launch: {
      label: "Launch",
      title: "Put It on the Line",
      detail: "Connect a dedicated number so callers can reach this Bot directly.",
      primary: "Choose a number",
      skip: "Launch later",
      activationRequired: "Your Bot is created. A live number needs a plan.",
      activationDetail: (starterPriceUsd: number) =>
        `Every paid plan includes a dedicated number and live call minutes. Starter begins at $${starterPriceUsd}/mo.`,
      activationCta: "Choose your plan",
    },
    test: {
      label: "Try It",
      title: "Hear It First",
      detail:
        "Practice privately with your built-in voice. To hear a cloned voice in a conversation, connect a number and make a real test call.",
      primary: "Continue to launch",
      skip: "Skip for now",
    },
  },
  complete: {
    liveTitle: "It's on the Line",
    liveDetail: (agentName: string, phone: string) =>
      `${agentName} is on ${phone}. Dial from your phone when you're ready. That's activation.`,
    deferredTitle: "Ready When You Are",
    deferredDetail: (agentName: string) =>
      `${agentName} is saved. Connect a number under Phone when you want it live.`,
    studioCta: "Continue in Workspace",
    phoneCta: "Get a number",
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
  savedDetail: (agentName: string) => `${agentName} is saved. Preview Voice is ready in Set Up.`,
  allowanceDetail: "This month's Preview Voice is used. We'll restore it when you go live.",
  cta: "Contact support",
  href: "/contact?topic=billing",
} as const;
