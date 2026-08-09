/**
 * Post-signup onboarding copy — Account Holder-facing, Wireline-native.
 */

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
      label: "Review",
      title: "Optional: review what your agent learned",
      detail:
        "Your greeting and job description are saved. Add a site, document, or policy now if it matters for the first call, or train more later.",
      salesHint:
        "Recommended first path: teach the outcomes that matter on day one, then connect the live number when you're ready to dial.",
      // The step title already carries "Optional:", which the activation-path
      // contract pins as the honesty signal. Repeating it on the button said it
      // twice in one card; "Open X" also matches the rest of the app.
      primary: "Open training",
      secondary: "Continue to number",
    },
    channels: {
      label: "Channels",
      title: "Connect where customers reach you",
      detail:
        "Phone is the default lane. Open Connections when you need CRM, SMS, email, or other tools linked.",
      phoneTitle: "Business phone line",
      phoneDetail: "Provision a US number on the next step — callers reach this agent directly.",
      connectionsTitle: "Connections",
      connectionsDetail: "Mailbox, Salesforce, SMS threads, and routing live under Connections.",
      connectionsCta: "Open Connections",
      continue: "Continue to phone line",
    },
    wire: {
      label: "Number",
      title: "Connect a live line",
      detail:
        "Provision a US number so callers reach this agent. A paid plan is required for live number provisioning.",
      primary: "Provision number",
      skip: "Connect later",
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
    wiredTitle: "You're live",
    wiredDetail: (agentName: string, phone: string) =>
      `${agentName} is on ${phone}. Dial from your phone when you're ready — that's activation.`,
    deferredTitle: "Ready in Studio",
    deferredDetail: (agentName: string) =>
      `${agentName} is trained and waiting. Connect a number under Settings → Phone when you're ready to go live.`,
    studioCta: "Continue in Studio",
    phoneCta: "Phone settings",
  },
} as const;
