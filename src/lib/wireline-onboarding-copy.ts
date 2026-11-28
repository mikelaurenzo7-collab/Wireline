/**
 * First-run copy, Account Holder-facing and BotBound-native.
 *
 * Every account has one Bot, Bo (DEFAULT_BOT_NAME in bot-name.ts). An account
 * that opens the Workspace without a Bot gets Bo, and Bo's first conversation
 * is the onboarding: the business name, then four questions whose answers go to
 * Knowledge, then the things to do next. Public marketing uses capability and
 * outcome copy, without a setup sequence.
 */

export const ACTIVATION_NUDGE_COPY = {
  eyebrow: "First call",
  body: "Try a call to check your Bot's greeting and answers.",
  cta: "Call your Bot",
} as const;

/** Bo's first conversation, one question at a time. */
export const BO_ONBOARDING_COPY = {
  stepLabel: (step: number, total: number) => `Step ${step} of ${total}`,
  finishLater: "Finish Later",
  gettingReady: "Getting ready…",
  /** Said before the first question. */
  intro: (botName: string) => `Hi, I'm ${botName}. I'll answer your calls, texts, and email.`,
  name: {
    question: "First, what's your business called?",
    placeholder: "For example: Rivera Plumbing",
    saved: (business: string) =>
      `Nice to meet you, ${business}. Callers will hear that name when I answer.`,
    notSaved: "I couldn't save your business name just now. You can add it later in Settings.",
    skipped: "No problem. You can add your business name later in Settings.",
  },
  about: {
    question: "What's your business called, and what do you do?",
    followUp: (business: string) =>
      `What does ${business} do, and where? Tell me your services, the area you serve, and your hours.`,
    placeholder: "For example: Rivera Plumbing. We fix leaks and water heaters in Austin.",
    unclear:
      "I couldn't pick out the details. Try a sentence like “Rivera Plumbing fixes leaks and water heaters in Austin.”",
  },
  website: {
    question:
      "Do you have a website? Paste the link and I'll read it to learn your services, hours, and prices.",
    placeholder: "For example: riveraplumbing.com",
    read: "Read My Website",
    none: "I Don't Have One",
    invalid: "That doesn't look like a website address. Try something like riveraplumbing.com.",
    reading: "Reading your website…",
    lookupOffer:
      "No problem. I can look you up online. I'll show you what I find before I save anything.",
    lookUp: "Look Me Up",
    lookingUp: "Looking you up…",
    found: "Here's what I found:",
    confirm: "Is this your business?",
    yes: "Yes, Save It",
    no: "Not Us",
    declined: "Thanks. I won't save it.",
    notFound: "I couldn't find your business online. You can tell me about it any time in chat.",
  },
  questions: {
    question:
      "What do customers usually ask you? Give me the answers too, like prices, hours, or the area you serve.",
    placeholder:
      "For example: Service calls are $89. We're open Monday to Friday, 8 to 6. We serve Austin and Round Rock.",
  },
  checks: {
    question: "What should I always check with you before I agree to it? One per line.",
    placeholder:
      "For example:\nDiscounts or refunds\nJobs outside our service area\nPromising a same-day visit",
    saved: "Got it. I'll check with you before any of those.",
  },
  skip: "Skip",
  skipped: "No problem. You can tell me later in chat.",
  send: "Send",
  tryAgain: "Try Again",
  saving: "Saving…",
  done: {
    message:
      "That's a great start. Everything I learned is in Knowledge, and you can keep teaching me right here in chat. You can rename me any time in Set Up.",
    hear: "Hear Me",
    voice: "Pick My Voice",
    number: "Get a Number",
    chat: "Start Chatting",
  },
} as const;

/**
 * The one moment a plan is chosen: going live. Every "choose a plan" control
 * says this and opens Billing through choosePlanHref() (src/lib/signup-intent.ts).
 */
export const GO_LIVE_PLAN_COPY = {
  cta: "Choose a Plan",
  detail:
    "Setting up and rehearsing stay free. A plan connects calls, texts, and email with customers.",
} as const;

/**
 * Phone setup and Preview Voice fallback shown only when the server reports
 * self-serve checkout closed or the plan catalog cannot be reached (fail
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
