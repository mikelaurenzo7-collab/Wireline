/**
 * Personal mobile activation catalog — the single source of truth for the
 * `/app/personal` migration surface (Intents, Siri & Shortcuts, Devices,
 * Get the App).
 *
 * This MUST stay in parity with the native activation layer so the web control
 * panel is an honest mirror of what ships on the phone:
 *   - iOS App Intents + App Shortcuts → `ios/Wireline/Intents/*.swift`
 *   - iOS widgets + deep links        → `ios/WirelineWidgets/*.swift`
 *   - CarPlay scope                   → `ios/Wireline/CarPlay/CarPlaySceneDelegate.swift`
 *   - Android shortcuts / App Actions → `android/app/src/main/res/xml/shortcuts.xml`
 *   - Product plan                    → `ios/EVERYDAY_SHORTCUTS_PLAN.md`
 *
 * When you add or rename a native intent / phrase / deep link, update it here
 * too — `personal-mobile.test.ts` guards the shape and the parity invariants.
 */

/** Lifecycle of a capability across the activation surfaces. */
export type ActivationStatus = "Live" | "Setup" | "Beta" | "Roadmap";

/** Where a capability can be triggered from. Mirrors Apple/Android surfaces. */
export type Surface =
  | "App"
  | "Siri"
  | "Widget"
  | "Action Button"
  | "Back Tap"
  | "Control Center"
  | "Spotlight"
  | "CallKit"
  | "CarPlay"
  | "Contacts"
  | "Calendar"
  | "Watch"
  | "Android";

export interface IntentSpec {
  /** Stable id — matches the native App Intent struct where one exists. */
  id: string;
  /** The native App Intent struct name, when shipped (parity anchor). */
  nativeIntent?: string;
  title: string;
  /** One-line description of what Assistant actually does. */
  summary: string;
  /** Natural-language phrases the user can say (Siri / Assistant). */
  phrases: string[];
  surfaces: Surface[];
  status: ActivationStatus;
  /** Does running this foreground the app? (false = fully hands-free.) */
  opensApp: boolean;
  /** Confirmation / safety rule applied before Assistant acts. */
  guardrail?: string;
}

export interface IntentGroup {
  id: string;
  name: string;
  blurb: string;
  intents: IntentSpec[];
}

/**
 * The intent catalog, grouped the way users think about phone work.
 * `nativeIntent` ties a row to a real Swift `AppIntent` for parity checks.
 */
export const INTENT_GROUPS: IntentGroup[] = [
  {
    id: "calls",
    name: "Calls",
    blurb:
      "Place, screen, wait, and hand off calls without hunting for the right trigger. The core of everyday delegation.",
    intents: [
      {
        id: "ask-assistant",
        nativeIntent: "AskWirelineIntent",
        title: "Ask Wireline",
        summary: "Open the command surface and tell Assistant what to handle.",
        phrases: ["Ask Wireline", "Hey Wireline", "Open Wireline and ask"],
        surfaces: ["App", "Siri", "Widget", "Action Button", "Control Center", "Spotlight"],
        status: "Live",
        opensApp: true,
      },
      {
        id: "place-call",
        nativeIntent: "CallAgentIntent",
        title: "Place a call",
        summary:
          "Give Assistant a number, contact, or business plus a short message; it dials through Vapi and reports back.",
        phrases: [
          "Have Wireline call the doctor and say I'm running late",
          "Tell Wireline to call the pharmacy",
        ],
        surfaces: ["App", "Siri", "Action Button"],
        status: "Live",
        opensApp: false,
        guardrail: "Confirms before calls that create costs, bookings, or commitments.",
      },
      {
        id: "call-contact",
        title: "Call a contact",
        summary: "Resolve a saved contact (\u201ccall Mom\u201d) and confirm before dialing.",
        phrases: ["Have Wireline call Mom", "Ask Wireline to call my dentist"],
        surfaces: ["Siri", "Contacts", "App"],
        status: "Setup",
        opensApp: false,
        guardrail: "Asks for confirmation when more than one contact matches.",
      },
      {
        id: "call-business",
        title: "Call a business",
        summary: "Pharmacies, restaurants, offices, schools, vets, utilities, and support lines.",
        phrases: ["Call the pharmacy and check my prescription", "Move my reservation to 7:30"],
        surfaces: ["App", "Siri"],
        status: "Setup",
        opensApp: false,
      },
      {
        id: "wait-on-hold",
        title: "Wait on hold",
        summary: "Assistant holds the line and brings you back the moment a human answers.",
        phrases: ["Call support and get me when a human is on", "Wait on hold for me"],
        surfaces: ["App", "Siri"],
        status: "Live",
        opensApp: false,
      },
      {
        id: "take-this-call",
        nativeIntent: "TakeThisCallIntent",
        title: "Take this call",
        summary: "Hand an eligible live call to Assistant; it transfers to your callback number.",
        phrases: ["Have Wireline take this", "Siri, let Wireline handle this call"],
        surfaces: ["CallKit", "Siri"],
        status: "Live",
        opensApp: false,
        guardrail: "Requires a saved callback number; never transfers sensitive calls silently.",
      },
      {
        id: "call-back-missed",
        title: "Call back missed call",
        summary:
          "Return your last relevant missed call safely \u2014 the strongest hands-free driving shortcut.",
        phrases: ["Call back my last missed call", "Return that missed call"],
        surfaces: ["CarPlay", "Siri", "App"],
        status: "Live",
        opensApp: false,
      },
    ],
  },
  {
    id: "scheduling",
    name: "Scheduling",
    blurb:
      "Appointments need guardrails, calendar context, and explicit confirmation before Assistant commits.",
    intents: [
      {
        id: "reschedule",
        title: "Reschedule",
        summary: "Move an appointment and report back with the confirmed time.",
        phrases: ["Call the dentist and move my cleaning to next week"],
        surfaces: ["Siri", "App", "Calendar"],
        status: "Setup",
        opensApp: false,
        guardrail: "Saves a follow-up if the new time can't be confirmed on the call.",
      },
      {
        id: "book-appointment",
        title: "Book appointment",
        summary: "Collect options, pick a time window, then ask before booking.",
        phrases: ["Book me a haircut Saturday morning"],
        surfaces: ["Siri", "App", "Calendar"],
        status: "Setup",
        opensApp: false,
        guardrail: "Always confirms time, location, and any deposit before committing.",
      },
      {
        id: "cancel-appointment",
        title: "Cancel appointment",
        summary:
          "Cancel with guardrails \u2014 always confirm fees and irreversible actions first.",
        phrases: ["Cancel my Thursday appointment"],
        surfaces: ["Siri", "App", "Calendar"],
        status: "Setup",
        opensApp: false,
        guardrail: "Requires explicit confirmation before any cancellation or fee.",
      },
      {
        id: "add-reminder",
        title: "Add reminder",
        summary: "Turn a call outcome into a reminder or calendar follow-up.",
        phrases: ["Remind me to pick up the prescription before 6"],
        surfaces: ["Siri", "Calendar", "App"],
        status: "Setup",
        opensApp: false,
      },
    ],
  },
  {
    id: "follow-up",
    name: "Follow-up",
    blurb:
      "Summaries, status checks, recaps, and attention queues \u2014 the loop that makes Assistant feel useful every day.",
    intents: [
      {
        id: "check-status",
        title: "Check status",
        summary: "Ask a business a bounded question \u2014 prescription, order, refund, paperwork.",
        phrases: ["Check if my prescription is ready", "Ask the shop if my car is done"],
        surfaces: ["App", "Siri"],
        status: "Live",
        opensApp: false,
      },
      {
        id: "summarize-last-call",
        nativeIntent: "SummarizeLastCallIntent",
        title: "Summarize last call",
        summary: "Speak a short recap first; open the app for the full detail.",
        phrases: ["What happened on my last call?", "Ask Wireline to summarize my last call"],
        surfaces: ["Siri", "Widget", "App"],
        status: "Live",
        opensApp: false,
        guardrail: "Keeps spoken output short and privacy-preserving on Lock Screen / CarPlay.",
      },
      {
        id: "what-needs-attention",
        nativeIntent: "WhatNeedsAttentionIntent",
        title: "What needs attention",
        summary: "A spoken or glanceable digest of unresolved calls, approvals, and follow-ups.",
        phrases: ["What calls need my attention?", "Wireline, what needs my attention"],
        surfaces: ["Siri", "Widget", "App"],
        status: "Live",
        opensApp: false,
      },
      {
        id: "send-recap",
        title: "Send me the recap",
        summary: "Push, email, or text the outcome to yourself instead of reading it aloud.",
        phrases: ["Send me the recap", "Text me what happened"],
        surfaces: ["Siri", "App"],
        status: "Setup",
        opensApp: false,
      },
      {
        id: "mark-followed-up",
        title: "Mark followed up",
        summary: "Close a resolved task from the Activity queue.",
        phrases: ["Mark that one as handled"],
        surfaces: ["App", "Siri"],
        status: "Roadmap",
        opensApp: false,
      },
    ],
  },
];

/**
 * Auto-registered App Shortcut phrases — these light up in Siri / Spotlight /
 * Shortcuts the moment the app installs, no setup required. Mirrors
 * `WirelineShortcuts: AppShortcutsProvider` in WirelineIntents.swift.
 */
export interface SiriPhrase {
  intentId: string;
  shortTitle: string;
  /** SF Symbol used by the native AppShortcut (for visual parity). */
  symbol: string;
  phrases: string[];
}

export const SIRI_PHRASES: SiriPhrase[] = [
  {
    intentId: "ask-assistant",
    shortTitle: "Ask Wireline",
    symbol: "mic.fill",
    phrases: ["Ask Wireline", "Hey Wireline", "Open Wireline and ask"],
  },
  {
    intentId: "place-call",
    shortTitle: "Place a call",
    symbol: "phone.arrow.up.right",
    phrases: ["Have Wireline place a call", "Tell Wireline to call someone"],
  },
  {
    intentId: "summarize-last-call",
    shortTitle: "Summarize last call",
    symbol: "text.bubble",
    phrases: ["Ask Wireline to summarize my last call", "What did my last Wireline call say"],
  },
  {
    intentId: "what-needs-attention",
    shortTitle: "What needs attention",
    symbol: "bell.badge",
    phrases: ["Ask Wireline what needs my attention", "Wireline what needs my attention"],
  },
  {
    intentId: "open-wireline",
    shortTitle: "Open Wireline",
    symbol: "rectangle.stack.fill",
    phrases: ["Open Wireline"],
  },
];

/** Hardware / system fast triggers the user wires up themselves in iOS. */
export interface FastTrigger {
  id: string;
  name: string;
  detail: string;
  /** Concrete setup steps shown in the in-app guide. */
  steps: string[];
  availability: string;
  surface: Surface;
}

export const FAST_TRIGGERS: FastTrigger[] = [
  {
    id: "action-button",
    name: "Action Button",
    detail: "One press launches \u201cAsk Wireline\u201d on iPhone 15 Pro and later.",
    steps: [
      "Open Settings \u203a Action Button.",
      "Swipe to Shortcut.",
      "Choose \u201cAsk Wireline\u201d.",
    ],
    availability: "iPhone 15 Pro+",
    surface: "Action Button",
  },
  {
    id: "back-tap",
    name: "Back Tap",
    detail:
      "Double- or triple-tap the back of any modern iPhone to ask Wireline \u2014 great for accessibility.",
    steps: [
      "Open Settings \u203a Accessibility \u203a Touch \u203a Back Tap.",
      "Pick Double Tap or Triple Tap.",
      "Select the \u201cAsk Wireline\u201d shortcut.",
    ],
    availability: "iPhone 8+",
    surface: "Back Tap",
  },
  {
    id: "control-center",
    name: "Control Center",
    detail: "Add a Shortcuts tile so Wireline is one swipe away from any screen.",
    steps: [
      "Open Settings \u203a Control Center.",
      "Add the Shortcut control.",
      "Point it at \u201cAsk Wireline\u201d.",
    ],
    availability: "iOS 16+",
    surface: "Control Center",
  },
  {
    id: "spotlight",
    name: "Spotlight",
    detail:
      "Swipe down and type \u201cAsk Wireline\u201d \u2014 App Shortcuts surface automatically.",
    steps: [
      "Swipe down on the Home Screen.",
      "Type \u201cWireline\u201d.",
      "Tap a suggested shortcut \u2014 no setup needed.",
    ],
    availability: "Automatic",
    surface: "Spotlight",
  },
];

/** Home / Lock Screen widgets. Mirrors `WirelineWidgets/*.swift`. */
export interface WidgetSpec {
  id: string;
  name: string;
  detail: string;
  families: string[];
  deepLink: string;
  status: ActivationStatus;
}

export const WIDGETS: WidgetSpec[] = [
  {
    id: "ask-wireline",
    name: "Ask Wireline",
    detail: "One-tap launch into the request composer from Home or Lock Screen.",
    families: ["Home small", "Home medium", "Lock circular", "Lock rectangular"],
    deepLink: "wireline://ask",
    status: "Live",
  },
  {
    id: "needs-attention",
    name: "Needs Attention",
    detail: "Glanceable count of calls that need follow-up, synced from the app.",
    families: ["Home small", "Lock circular", "Lock rectangular", "Lock inline"],
    deepLink: "wireline://calls",
    status: "Live",
  },
  {
    id: "assistant",
    name: "Assistant handoff",
    detail: "Send an active call to Assistant in one tap \u2014 the off-car activation vector.",
    families: ["Home small", "Lock circular", "Lock rectangular"],
    deepLink: "wireline://ask",
    status: "Live",
  },
  {
    id: "wallet",
    name: "Wallet",
    detail: "Remaining minutes and balance at a glance (business workspaces).",
    families: ["Home small", "Lock rectangular"],
    deepLink: "wireline://wallet",
    status: "Beta",
  },
];

/** Deep links the app responds to (parity with `WirelineApp.onOpenURL`). */
export const DEEP_LINKS = [
  { url: "wireline://ask", target: "Ask Wireline composer" },
  { url: "wireline://calls", target: "Calls / activity list" },
  { url: "wireline://wallet", target: "Wallet (minutes + balance)" },
] as const;

/** Platform availability for the Get-the-App surface. */
export interface PlatformSpec {
  id: string;
  name: string;
  detail: string;
  status: ActivationStatus;
  icon: "iphone" | "watch" | "car" | "tablet" | "android" | "globe";
}

export const PLATFORMS: PlatformSpec[] = [
  {
    id: "iphone",
    name: "iPhone",
    detail: "Primary surface: Assistant, calls, number, activity, Siri, widgets.",
    status: "Beta",
    icon: "iphone",
  },
  {
    id: "carplay",
    name: "CarPlay",
    detail: "Low-distraction callbacks and live-call handoff while driving.",
    status: "Beta",
    icon: "car",
  },
  {
    id: "watch",
    name: "Apple Watch",
    detail: "Glanceable Ask Wireline and take-this-call triggers.",
    status: "Roadmap",
    icon: "watch",
  },
  {
    id: "android",
    name: "Android",
    detail: "Ask Wireline, call handling, widgets, and Assistant App Actions.",
    status: "Beta",
    icon: "android",
  },
  {
    id: "ipad",
    name: "iPad",
    detail: "The full workspace on a bigger canvas \u2014 review, train, and approve.",
    status: "Roadmap",
    icon: "tablet",
  },
  {
    id: "web",
    name: "Web",
    detail: "This control panel \u2014 set up automations and review activity anywhere.",
    status: "Live",
    icon: "globe",
  },
];

/**
 * App distribution. iOS/Android stores aren't live yet, so the primary CTA is
 * the TestFlight / early-access waitlist; store links are placeholders until
 * the listings publish. Keep these here so the CTA flips to real links with a
 * one-line change.
 */
export const APP_DISTRIBUTION = {
  ios: {
    status: "TestFlight" as "TestFlight" | "Live" | "Coming soon",
    storeUrl: null as string | null,
    testflightUrl: "https://testflight.apple.com/join/wireline",
    label: "iPhone \u00b7 iOS 17+",
  },
  android: {
    status: "Coming soon" as "Live" | "Coming soon",
    storeUrl: null as string | null,
    label: "Android 13+",
  },
  /** Where the QR + \u201cnotify me\u201d flows point on the web today. */
  landing: "https://trywireline.com/app",
} as const;

/** Flattened view of every intent (handy for parity tests + search). */
export const ALL_INTENTS: IntentSpec[] = INTENT_GROUPS.flatMap((g) => g.intents);
