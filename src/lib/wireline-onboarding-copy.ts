/**
 * Post-signup onboarding copy — Account Holder-facing, BotBound-native.
 * Public loop: Build → Train → Launch → Improve.
 * After create, the setup guide is Train → Test → Launch.
 */

/** Shown after Fast Start — Bot exists but activation (first useful call) pending. */
export const ACTIVATION_PENDING_COPY = {
  eyebrow: "One step left",
  title: "Make your first",
  titleAccent: "real call",
  subtitle: (agentName: string) =>
    `${agentName} has a number. Dial it from your phone. Activation counts when a real conversation completes.`,
  phoneLabel: "Your live number",
  dialCta: "Call now to activate",
  browserTestTitle: "Browser test (optional)",
  browserTestDetail:
    "Preview voice and script in Studio. Simulator calls do not count toward activation.",
  browserTestAction: "Open Studio",
  opsTitle: "Watch Activity",
  opsDetail: "See the call land in real time once you dial in.",
  opsAction: "Open Activity",
} as const;

export const ACTIVATION_NUDGE_COPY = {
  eyebrow: "Activation",
  body: "Dial your line for a real conversation. That's when BotBound counts you as live.",
  cta: "Call to activate",
} as const;

/** Guided steps after create — Train → Test → Launch. */
export const POST_CREATE_WIZARD_COPY = {
  eyebrow: "Setup",
  title: "Next up for",
  steps: {
    train: {
      label: "Train",
      title: "Teach it the job",
      detail: "Review its instructions. Add a site, document, or policy when needed.",
      salesHint: "Train what matters on day one, hear it privately, then put it on a live number.",
      primary: "Open training",
      secondary: "Continue to test",
    },
    launch: {
      label: "Launch",
      title: "Put it on the line",
      detail: "Every paid plan includes a US number. Callers reach this Bot directly.",
      primary: "Get a number",
      skip: "Launch later",
      activationRequired: "Your Bot is created. A live number needs a plan.",
      activationDetail: (starterPriceUsd: number) =>
        `Every paid plan includes a dedicated number and live call minutes. Starter begins at $${starterPriceUsd}/mo.`,
      activationCta: "Choose your plan",
    },
    test: {
      label: "Test",
      title: "Hear it first",
      detail:
        "Run a private browser test before anyone else hears it. Simulator calls do not count as going live.",
      primary: "Continue to launch",
      skip: "Skip test",
    },
  },
  complete: {
    liveTitle: "It's on the line",
    liveDetail: (agentName: string, phone: string) =>
      `${agentName} is on ${phone}. Dial from your phone when you're ready. That's activation.`,
    deferredTitle: "Ready when you are",
    deferredDetail: (agentName: string) =>
      `${agentName} is saved. Connect a number under Calls when you want it live.`,
    studioCta: "Continue in Studio",
    phoneCta: "Get a number",
  },
} as const;
