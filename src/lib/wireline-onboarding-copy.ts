/**
 * Post-signup onboarding copy — Account Holder-facing, WIRELINE-native.
 */

/** Shown after Fast Start — agent exists but activation (first useful call) pending. */
export const ACTIVATION_PENDING_COPY = {
  eyebrow: "One step left",
  title: "Make your first",
  titleAccent: "real call",
  subtitle: (agentName: string) =>
    `${agentName} is provisioned. Dial your line from your phone. Activation counts when a customer-quality conversation completes.`,
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

/** Guided steps after Fast Start create — Create → Train → Test → Wire. */
export const POST_CREATE_WIZARD_COPY = {
  eyebrow: "Fast Start",
  title: "Next up for",
  steps: {
    train: {
      label: "Review",
      title: "Optional: review what your Bot learned",
      detail:
        "Your greeting and job description are saved. Add a site, document, or policy now if it matters for the first call, or train more later.",
      salesHint:
        "Recommended first path: teach the outcomes that matter on day one, privately test the Bot, then connect a live number when you are ready to go live.",
      primary: "Open training",
      secondary: "Continue to private test",
    },
    channels: {
      label: "Channels",
      title: "Connect where customers reach you",
      detail:
        "Phone is the default lane. Open Connections when you need CRM, SMS, email, or other tools linked.",
      phoneTitle: "Bot phone line",
      phoneDetail: "Provision a US number on the next step. Callers reach this agent directly.",
      connectionsTitle: "Connections",
      connectionsDetail: "Mailbox, Salesforce, SMS threads, and routing live under Connections.",
      connectionsCta: "Open Connections",
      continue: "Continue to phone line",
    },
    wire: {
      label: "Number",
      title: "Connect a live line",
      detail:
        "Provision a US number so callers reach this Bot. A paid plan is required for live number provisioning.",
      primary: "Provision number",
      skip: "Connect later",
      activationRequired: "Your Bot is trained. Its live number just needs a plan.",
      activationDetail: (starterPriceUsd: number) =>
        `Every paid plan includes a dedicated number and live call minutes. Starter begins at $${starterPriceUsd}/mo.`,
      activationCta: "Choose your plan",
    },
    test: {
      label: "Test",
      title: "Hear your Bot",
      detail:
        "Run a private browser test before you pay for a live number. Simulator calls do not count toward activation.",
      primary: "Continue to number",
      skip: "Skip private test",
    },
  },
  complete: {
    wiredTitle: "You're live",
    wiredDetail: (agentName: string, phone: string) =>
      `${agentName} is on ${phone}. Dial from your phone when you're ready. That's activation.`,
    deferredTitle: "Ready in Studio",
    deferredDetail: (agentName: string) =>
      `${agentName} is trained and waiting. Connect a number under Calls → Setup when you're ready to go live.`,
    studioCta: "Continue in Studio",
    phoneCta: "Connect a number",
  },
} as const;
