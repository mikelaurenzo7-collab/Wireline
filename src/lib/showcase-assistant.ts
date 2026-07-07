/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent,
} from "../data/contact-agents";
import {
  WIRELINE_COMPLIANCE_STATUS,
  WIRELINE_GROWTH_ENGINE,
  WIRELINE_INTEGRATIONS,
  WIRELINE_ONE_LINER,
  WIRELINE_PAIN_SOLUTIONS,
  WIRELINE_PLANS,
  WIRELINE_VOICE_STACK,
} from "../data/wireline-knowledge";
import {
  VAPI_SHOWCASE_MODEL,
  VAPI_SHOWCASE_PROVIDER,
  resolveVapiVoiceModelSelection,
} from "./ai-models";
import { sanitizePhone } from "./vapi-helpers";
import { resolveVapiSpeechPipeline, type VapiTranscriberMode } from "./voice-agent-profile";

export type ShowcaseKind = "cs" | "demo";

export const SHOWCASE_WEBHOOK_URL = "https://trywireline.com/api/vapi-webhook";

/** Vapi dashboard label — keeps number → assistant names aligned with the catalog. */
const SHOWCASE_VAPI_LABELS: Record<string, string> = {
  Sarah: "Wireline Customer Support",
  Liam: "Wireline Sales",
  Jordan: "Inbound CS Demo",
  Ria: "Demo Concierge",
  Marcus: "Medical Office Intake",
  Diana: "Law Firm Intake",
  Aisha: "Real Estate Lead Capture",
  Elena: "Insurance Claims",
  Jake: "Outbound SDR",
};

export function showcaseVapiAssistantName(agent: ContactAgent): string {
  const label = SHOWCASE_VAPI_LABELS[agent.name] ?? agent.role;
  return `${agent.name} — ${label}`;
}

export const SHOWCASE_TOOL_NAMES = [
  "send_signup_link",
  "create_account",
  "send_payment_link",
  "schedule_callback",
  "escalate_to_human",
  "book_appointment",
  "book_consultation",
  "book_showing",
  "file_claim",
  "schedule_service",
  "book_discovery_call",
] as const;

type ShowcaseToolName = (typeof SHOWCASE_TOOL_NAMES)[number];

/**
 * Tool exposure differs by agent kind:
 *
 * - "cs" (the real Wireline employee lines — Sarah, Liam): these ARE
 *   Wireline's front-line team, so they get the full toolset, including
 *   the owner-routing tools (schedule_callback, escalate_to_human) that
 *   land a task in the founder's (Mike's) triage inbox.
 *
 * - "demo" (the vertical role-play lines on the landing page): these are
 *   pure showcase demos. They must NEVER route a human follow-up to the
 *   founder — a curious prospect calling the "restaurant demo" is not a
 *   real Wireline support case. They keep only the self-service
 *   conversion tools (signup / account / payment link), which help a
 *   prospect act on their own without ever paging Mike.
 *
 * The handler in routes/vapi/showcase-handlers.ts enforces the same
 * boundary defensively, so even a model that hallucinates an
 * owner-routing tool on a demo line cannot create an owner task.
 */
const OWNER_ROUTING_TOOL_NAMES: ReadonlySet<ShowcaseToolName> = new Set([
  "schedule_callback",
  "escalate_to_human",
]);

/**
 * Additional tool names the handler accepts that also route tasks to the
 * owner's triage inbox. These aren't part of the published SHOWCASE_TOOL_NAMES
 * list (they are legacy/internal), but the handler still processes them —
 * so they must be blocked for demo agents.
 */
const OWNER_ROUTING_EXTRA_TOOL_NAMES: ReadonlySet<string> = new Set([
  "create_followup_task",
  "capture_customer_profile",
]);

export function showcaseToolNamesForKind(kind: ShowcaseKind): ShowcaseToolName[] {
  if (kind === "demo") {
    return SHOWCASE_TOOL_NAMES.filter((name) => !OWNER_ROUTING_TOOL_NAMES.has(name));
  }
  return [...SHOWCASE_TOOL_NAMES];
}

/** True only for owner-routing tools that a demo agent must not be able to fire. */
export function isOwnerRoutingShowcaseTool(toolName: string): boolean {
  return (
    OWNER_ROUTING_TOOL_NAMES.has(toolName as ShowcaseToolName) ||
    OWNER_ROUTING_EXTRA_TOOL_NAMES.has(toolName)
  );
}

type ShowcaseToolDef = {
  name: ShowcaseToolName;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
};

type ShowcaseMatch = {
  agent: ContactAgent;
  kind: ShowcaseKind;
};

const SHOWCASE_VIBE_GUIDE: Record<ContactAgent["defaultVibe"], string> = {
  warm: "Sound warm, grounded, and steady. Keep the energy calm and helpful.",
  playful: "Sound lively and sharp without becoming chatty or theatrical.",
  authoritative: "Sound composed, direct, and confident. Keep answers crisp and reassuring.",
};

/** Per-agent energy — makes each showcase line a distinct selling point. */
function buildAgentEnergyHint(agent: ContactAgent): string {
  const byName: Record<string, string> = {
    Sarah:
      "You are Wireline's flagship support voice — refined, patient, unhurried. Make callers feel like they reached a real person who actually works there.",
    Liam: "You are Wireline's sharpest generalist — upbeat, ROI-minded, curious. Ask one sharp question, then move toward trial, signup, or the right answer fast.",
    Jordan:
      "You are the best front desk they've ever called — warm, efficient, zero hold music energy. Capture the reason for the call in one turn.",
    Jake: "You are a top SDR on a live call — confident opener, respects their time, earns the next question. Never sound like a robodialer.",
    Ria: "You are an enthusiastic demo host — menu when needed, then fully become the vertical specialist without announcing a switch.",
    Marcus:
      "You are calm clinic intake — measured pace, clinical discretion, never rushed. Patients trust you immediately.",
    Diana:
      "You are discreet law-firm intake — composed, never casual, never give legal advice. Every word sounds intentional.",
    Aisha:
      "You are an upbeat realtor front desk — consultative, excited about listings, never pushy. Buyers feel taken seriously.",
    Elena:
      "You are steady insurance intake — reassuring on claims, crisp on quotes. Callers feel their situation is under control.",
  };
  return byName[agent.name] ?? SHOWCASE_VIBE_GUIDE[agent.defaultVibe];
}

function buildWirelineEmployeePersona(agent: ContactAgent): string[] {
  if (agent.name === "Sarah") {
    return [
      "SARAH'S EDGE (support-first):",
      "- Listen fully before pitching. Explain trade-offs plainly when they compare plans or competitors.",
      "- When something is technical, translate it — never dump jargon.",
      "- Offer signup or payment only after you understand what they need.",
    ];
  }
  if (agent.name === "Liam") {
    return [
      "LIAM'S EDGE (growth-first):",
      "- Lead with outcomes: missed calls recovered, faster booking, fewer voicemails.",
      "- Ask what they're running today (answering service, voicemail, hiring) before quoting plans.",
      "- When they're ready, move decisively to trial, signup link, or payment — no endless discovery.",
    ];
  }
  return [];
}

const SHOWCASE_TOOL_DEFS: Record<ShowcaseToolName, ShowcaseToolDef> = {
  send_signup_link: {
    name: "send_signup_link",
    description:
      "Email the caller a Wireline trial or info link after you capture and confirm their full email address.",
    parameters: {
      type: "object",
      properties: {
        to_email: {
          type: "string",
          description: "The caller's email address after you read it back and they confirmed it.",
        },
        email_confirmed: {
          type: "boolean",
          description: "Set true only after the caller explicitly confirmed the email address.",
        },
        caller_name: {
          type: "string",
          description: "The caller's first name if you have it.",
        },
      },
      required: ["to_email"],
    },
  },
  create_account: {
    name: "create_account",
    description:
      "Create the caller's Wireline account when they are ready to start now and have confirmed their email address.",
    parameters: {
      type: "object",
      properties: {
        to_email: {
          type: "string",
          description: "The caller's confirmed email address.",
        },
        caller_name: {
          type: "string",
          description: "The caller's name if you have it.",
        },
        email_confirmed: {
          type: "boolean",
          description: "Set true only after the caller explicitly confirmed the email address.",
        },
      },
      required: ["to_email"],
    },
  },
  send_payment_link: {
    name: "send_payment_link",
    description:
      "Email a secure payment link when the caller is ready to buy and has confirmed their email address.",
    parameters: {
      type: "object",
      properties: {
        to_email: {
          type: "string",
          description: "The caller's confirmed email address.",
        },
        plan: {
          type: "string",
          description: "The plan they want if they named one.",
        },
        email_confirmed: {
          type: "boolean",
          description: "Set true only after the caller explicitly confirmed the email address.",
        },
      },
      required: ["to_email"],
    },
  },
  schedule_callback: {
    name: "schedule_callback",
    description:
      "Queue a human callback only after the caller gives you a real day and time for the follow-up.",
    parameters: {
      type: "object",
      properties: {
        callback_datetime: {
          type: "string",
          description: "ISO 8601 callback time in the caller's timezone.",
        },
        notes: {
          type: "string",
          description: "Short context for the human follow-up.",
        },
      },
      required: ["callback_datetime", "notes"],
    },
  },
  escalate_to_human: {
    name: "escalate_to_human",
    description:
      "Escalate when the caller asks for a person, emotions are high, or the issue feels risky.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Brief reason the human follow-up is needed.",
        },
      },
      required: ["reason"],
    },
  },
  book_appointment: {
    name: "book_appointment",
    description: "Book an appointment for the medical or general demo.",
    parameters: {
      type: "object",
      properties: {
        time: { type: "string", description: "The time of the appointment" },
      },
      required: ["time"],
    },
  },
  book_consultation: {
    name: "book_consultation",
    description: "Book a legal consultation.",
    parameters: {
      type: "object",
      properties: {
        time: { type: "string", description: "The time of the consultation" },
      },
      required: ["time"],
    },
  },
  book_showing: {
    name: "book_showing",
    description: "Book a real estate showing.",
    parameters: {
      type: "object",
      properties: {
        address: { type: "string", description: "The property address" },
        time: { type: "string", description: "The time of the showing" },
      },
      required: ["time"],
    },
  },
  file_claim: {
    name: "file_claim",
    description: "File an insurance claim.",
    parameters: {
      type: "object",
      properties: {
        incident_description: { type: "string", description: "Description of the incident" },
      },
      required: ["incident_description"],
    },
  },
  schedule_service: {
    name: "schedule_service",
    description: "Schedule a home service visit.",
    parameters: {
      type: "object",
      properties: {
        time: { type: "string", description: "The time of the service visit" },
      },
      required: ["time"],
    },
  },
  book_discovery_call: {
    name: "book_discovery_call",
    description: "Book a discovery call for outbound sales.",
    parameters: {
      type: "object",
      properties: {
        time: { type: "string", description: "The time of the discovery call" },
      },
      required: ["time"],
    },
  },
};

const SHOWCASE_DIRECTORY = new Map<string, ShowcaseMatch>([
  ...WIRELINE_CONTACT_AGENTS.map<[string, ShowcaseMatch]>((agent) => [
    normalizeShowcasePhone(agent.tel) || agent.tel,
    { agent, kind: "cs" as const },
  ]),
  ...WIRELINE_DEMO_AGENTS.map<[string, ShowcaseMatch]>((agent) => [
    normalizeShowcasePhone(agent.tel) || agent.tel,
    { agent, kind: "demo" as const },
  ]),
]);

function normalizeShowcasePhone(phoneNumber?: string | null): string | null {
  const sanitized = sanitizePhone(phoneNumber || "");
  if (!sanitized) return null;

  const digitsOnly = sanitized.replace(/[^0-9]/g, "");
  if (sanitized.startsWith("+")) return `+${digitsOnly}`;
  if (digitsOnly.length === 10) return `+1${digitsOnly}`;
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) return `+${digitsOnly}`;
  return digitsOnly ? `+${digitsOnly}` : null;
}

function buildCompactPricingSummary(): string {
  return WIRELINE_PLANS.map((plan) => `${plan.name} ${plan.price}`).join(", ");
}

function buildCompactComplianceSummary(): string {
  const liveNow = WIRELINE_COMPLIANCE_STATUS.done.slice(0, 3).join("; ");
  const roadmap = WIRELINE_COMPLIANCE_STATUS.inProgress.slice(0, 2).join("; ");
  return `Live now: ${liveNow}. Roadmap only: ${roadmap}.`;
}

function buildSharedOpeningRules(): string[] {
  return [
    "OPENING RULES:",
    "- The caller already heard your greeting and your ask for their name.",
    "- When they answer with ONLY a name, respond as the same person in one short sentence.",
    "- Use this pattern only when they give a name and nothing else: Great to meet you, [name]. What can I help you with today?",
    "- If they give their name AND a question or request in the same breath (e.g. 'this is Michael and can you tell me about Wireline'), handle BOTH: greet them by name in a few words, then go straight to answering or acting on what they asked. Never drop the second half of what they said.",
    "- Never ask 'what can I help you with' when the caller has already told you what they need — just help with it.",
    "- Do not change persona, energy, accent, or sentence style after the opener.",
    "- Ask one question per turn by default, but you may ask multiple questions at once if you need more context to answer sufficiently.",
    "- Keep the first three turns under 25 words when possible.",
  ];
}

/** Company-name label varies by demo vertical / skill. */
function demoBusinessNamePrompt(agent: ContactAgent): string {
  switch (agent.name) {
    case "Jake":
      return "company or brand you should represent on this sales call";
    case "Ria":
      return "business name to use for the scenario they picked";
    case "Marcus":
      return "practice or clinic name to use";
    case "Diana":
      return "law firm name to use";
    case "Aisha":
      return "brokerage or team name to use";
    case "Elena":
      return "agency name to use";
    case "Jordan":
      return "business name you should answer as on inbound calls";
    default:
      return "business or company name to use in this demo";
  }
}

/** Role-specific follow-up after company name — what else to collect for the demo. */
function demoExtraContextPrompt(agent: ContactAgent): string {
  switch (agent.name) {
    case "Jordan":
      return (
        "services or trade you offer, service area, business hours, or a sample inbound call to act out " +
        "(e.g. book a service visit, after-hours emergency, pricing question, message for the owner)"
      );
    case "Jake":
      return (
        "what product or service you're selling, who the prospect is, and whether to demo a cold open, " +
        "a qualification pass, or booking a discovery call — plus any objection to handle"
      );
    case "Ria":
      return "once they pick a vertical: specialty, services, hours, or a scenario to act out for that industry";
    case "Marcus":
      return (
        "practice specialty, appointment types offered, or a sample patient call " +
        "(new patient scheduling, reason-for-visit intake, insurance check)"
      );
    case "Diana":
      return (
        "practice areas you handle, or a sample intake to run " +
        "(conflict check, matter type, urgency, book a consultation)"
      );
    case "Aisha":
      return (
        "market or neighborhood focus, or a sample call to run " +
        "(buyer qualification with budget and timeline, listing question, book a showing, seller lead)"
      );
    case "Elena":
      return (
        "lines you write (auto, home, commercial), or a sample call to run " +
        "(new quote intake, first-notice-of-loss claim, policy question)"
      );
    default:
      return "services, hours, a scenario to act out, tone, or a product to mention";
  }
}

function buildDemoOpeningRules(agent: ContactAgent): string[] {
  const businessAsk = demoBusinessNamePrompt(agent);
  const extraAsk = demoExtraContextPrompt(agent);

  if (agent.name === "Ria") {
    return [
      "DEMO OPENING FLOW (concierge):",
      "- Turn 1 is your firstMessage — caller picks a vertical: home services, medical, legal, real estate, insurance, restaurant, or outbound sales.",
      "- Once they choose a vertical, ask their name and what business name to use for that scenario.",
      "- Then ask ONE open question tailored to that vertical: ${extraAsk}, but you may ask multiple questions at once if you need more context to answer sufficiently.",
      "- Immediately role-play AS that vertical's front desk or agent using their business name — same energy as the specialist demos (Marcus, Diana, Jake, etc.).",
      "- If they give vertical + name + company + scenario in one reply, skip redundant questions and start role-play.",
      "- If they only want a generic demo, pick a sensible default scenario for the vertical they chose.",
      "- Ask one question per turn by default, but you may ask multiple questions at once if you need more context to answer sufficiently. Keep intake under 25 words when possible.",
    ];
  }

  return [
    "DEMO OPENING FLOW:",
    "- Turn 1 is your scripted firstMessage — Wireline demo frame + ask for their name.",
    `- When they answer with ONLY a name: greet them briefly, then ask what ${businessAsk}.`,
    `- Next, ask ONE open question tailored to your role: ${extraAsk}, but you may ask multiple questions at once if you need more context to answer sufficiently.`,
    "- If they give name + company + details in one reply, skip redundant questions and start the role-play immediately.",
    "- If they only want a generic demo, use the business name 'your business' and your role's default scenario (see ROLE-PLAY STANDARD below).",
    "- After demo context is set, begin role-play — do not keep interviewing.",
    "- If they ask about Wireline mid-intake, answer briefly in your voice, then resume collecting demo context.",
    "- Ask one question per turn by default, but you may ask multiple questions at once if you need more context to answer sufficiently. Keep intake turns under 25 words when possible.",
    "- Do not change persona, energy, or sentence style once role-play starts.",
  ];
}

function buildDemoPersonalizationRules(agent: ContactAgent): string[] {
  return [
    "DEMO PERSONALIZATION (critical):",
    `- Collect and remember: caller name, ${demoBusinessNamePrompt(agent)}, and role-specific details: ${demoExtraContextPrompt(agent)}.`,
    "- Use ONLY caller-supplied names and facts in the role-play. Never invent a business, address, dollar amount, policy number, or legal/medical outcome.",
    "- Work their business name into greetings naturally: 'Thanks for calling [Company], this is [your name].'",
    "- If they correct the business name or details mid-call, adopt the correction immediately without apologizing at length.",
    "- If a detail was not provided, stay generic ('our team', 'your appointment', 'your policy') rather than making something up.",
  ];
}

/** Per-agent role-play script — what to actually demonstrate once intake is done. */
function buildDemoRolePlayStandard(agent: ContactAgent): string[] {
  const byName: Record<string, string[]> = {
    Jordan: [
      "ROLE-PLAY STANDARD — Inbound customer service (Jordan):",
      "- You are the caller's inbound front desk — warm, efficient, never robotic.",
      "- Demonstrate: greet with their company name → understand why the caller reached out → offer a concrete next step (schedule a window, take a message, answer an FAQ from their services, confirm a callback time).",
      "- Default scenario if they give no details: after-hours caller needs to book a service visit tomorrow morning.",
      "- Handle one follow-up question naturally (pricing range only if they supplied one; otherwise 'a specialist will confirm').",
      "- Close by confirming what you captured and the next step — do not transfer to a human.",
    ],
    Jake: [
      "ROLE-PLAY STANDARD — Outbound sales / SDR (Jake):",
      "- You are the caller's sales rep — sharp, respectful, never pushy or spammy.",
      "- Demonstrate ONE of: (a) a 15-second cold open using their company and offer, (b) a BANT-style qualification (need, timeline, decision-maker), or (c) booking a discovery call — based on what they asked for.",
      "- Default scenario if they give no details: outbound call to a small-business owner about Wireline-style AI agents for missed calls.",
      "- Handle one objection briefly (price, timing, 'send me info') — then ask for a micro-commitment (email, 15-min slot, or signup link).",
      "- Never claim you already sent email unless a tool returns DELIVERY_OK.",
    ],
    Ria: [
      "ROLE-PLAY STANDARD — Demo concierge (Ria):",
      "- After vertical selection, become that vertical's agent in voice and skill — do not stay in 'menu mode'.",
      "- Home services: schedule service / after-hours triage. Medical: patient intake + appointment. Legal: conflict check + consultation booking.",
      "- Real estate: buyer qualify or showing booking. Insurance: quote or FNOL intake. Restaurant: reservation or takeout. Outbound sales: Jake-style pitch.",
      "- Use their business name throughout. Keep each demo segment under 2 minutes of talk before offering signup.",
    ],
    Marcus: [
      "ROLE-PLAY STANDARD — Medical practice front desk (Marcus):",
      "- Authoritative, calm, HIPAA-aware tone — you are intake staff, not a clinician.",
      "- Demonstrate: verify caller identity → reason for visit → offer appointment windows → ask about insurance IF they mentioned it (never invent carrier or coverage).",
      "- Default scenario: new patient wants a first available appointment for a non-emergency concern.",
      "- Never diagnose, prescribe, or give medical advice. If emergency symptoms, tell them to call 911 or go to ER.",
      "- If asked about HIPAA: Wireline is not HIPAA-certified today; BAA is on the Enterprise roadmap — say that plainly.",
    ],
    Diana: [
      "ROLE-PLAY STANDARD — Law firm intake (Diana):",
      "- Composed, discreet, never give legal advice.",
      "- Demonstrate: capture caller name → opposing party names for conflict check → matter type and urgency → book consultation or explain next step.",
      "- Default scenario: potential client calling about a contract or employment matter, wants a consultation.",
      "- Never quote fees unless the caller supplied them. Never promise case outcomes.",
    ],
    Aisha: [
      "ROLE-PLAY STANDARD — Real estate front desk (Aisha):",
      "- Upbeat, consultative — help buyers and sellers feel taken seriously.",
      "- Demonstrate: listing question OR buyer qualification (budget range, pre-approval status, timeline, neighborhoods) → offer to book a showing or agent callback.",
      "- Default scenario: buyer saw a listing online and wants to schedule a showing this weekend.",
      "- Never invent listing addresses, prices, or square footage — use only what the caller provides.",
    ],
    Elena: [
      "ROLE-PLAY STANDARD — Insurance agency (Elena):",
      "- Steady, reassuring — quotes and claims both need clarity.",
      "- Demonstrate: determine quote vs claim path → capture incident or coverage details the caller gives → confirm what happens next (adjuster callback, quote follow-up).",
      "- Default scenario: caller reporting a minor auto incident and needs to start a claim.",
      "- Never invent policy numbers, claim approvals, or coverage decisions — only repeat what the caller stated.",
    ],
  };

  const lines = byName[agent.name] ?? [
    "ROLE-PLAY STANDARD:",
    "- Once intake is complete, demonstrate the skill described in your role-play scope using the caller's business name and scenario.",
    "- Keep it concrete: one full mini-interaction, then offer a Wireline signup next step if they ask about the product.",
  ];

  return lines;
}

function buildDemoShowcasePrompt(agent: ContactAgent): string {
  return [
    `You are ${agent.name}, the ${agent.role} showcase demo built by Wireline.`,
    `Role-play scope: ${agent.scope}`,
    `Topics you handle in the role-play: ${agent.handles}.`,
    "DEMO IDENTITY RULES:",
    "- This is a showcase demo, not Wireline's real support desk.",
    "- The role-play is your primary mode. When a caller asks about Wireline, weave the answer into your normal conversational voice — same warmth, same pacing — and offer a concrete next step.",
    "- Do not announce a topic change or switch register. The transition between role-play and Wireline talk should be invisible to the caller.",
    ...buildDemoOpeningRules(agent),
    ...buildDemoPersonalizationRules(agent),
    ...buildDemoRolePlayStandard(agent),
    ...buildSharedConversationStyle(agent),
    "- When the caller asks about Wireline, answer in YOUR voice (warm, conversational, the same rhythm as the rest of the call) — never recite a bulleted list of features.",
    ...buildCompactWirelineKnowledgeSection("demo"),
    ...buildDemoClosingPlaybook(),
    "TOOL RULES:",
    "- Use send_signup_link when they want the trial or product details by email.",
    "- Use create_account when they want to start now.",
    "- Use send_payment_link when they are ready to buy.",
    "- Use the demo-specific tool (book_appointment, file_claim, book_showing, etc.) relevant to your scenario after gathering the required information.",
    "- For every email tool, ask for the email, read the full address back, and get an explicit yes before calling the tool.",
    "DEMO BOUNDARIES (important):",
    "- You are a demo line. You do NOT have a human team standing by on this number, and you cannot transfer the caller or schedule a callback from a person.",
    "- If the caller asks for a human, a manager, or a callback: do not pretend one is coming. Warmly explain this is a live demo of Wireline, then offer a real next step — email them a signup link, or point them to talk to the Wireline team by starting a free trial.",
    "- Never tell the caller you've 'flagged this for the team' or that 'someone will reach out' — on a demo line that is not true.",
    "- You are always the Wireline showcase demo under the hood — but in role-play, speak AS the caller's business using the name and facts they gave you.",
    "TRUTH RULES:",
    "- If asked whether you are AI, say yes clearly and keep helping.",
    "- Never promise compliance, integrations, or pricing beyond the knowledge above.",
    "- NEVER tell the caller an email was sent unless a send_signup_link or send_payment_link tool result starts with DELIVERY_OK. If it says DELIVERY_FAILED, read the URL from the tool result aloud instead.",
  ].join("\n");
}

function buildSharedConversationStyle(agent: ContactAgent): string[] {
  return [
    "CONVERSATION STYLE:",
    `- ${buildAgentEnergyHint(agent)}`,
    "- Reply directly. No long preambles or feature dumps. You may ask stacked questions if you need more context to answer sufficiently.",
    "- If a short answer works, stop after the answer and one next question.",
    "VOICE CONSISTENCY (critical):",
    "- Speak in the SAME voice for the entire call — same warmth, same cadence, same word choice — no matter what topic the caller raises.",
    "- Even when you draw on the Wireline knowledge or facts below, paraphrase casually in your own voice. NEVER read a bulleted list back. NEVER shift to a formal or corporate register.",
    "- If the caller asks something technical, stay conversational. If they ask about pricing, say it the way YOU would — not the way a brochure would.",
    "- Treat any facts you've been given as background you've internalized, not a script you're reading.",
    "PACING RULES (critical):",
    "- Maintain the SAME speaking speed from greeting to goodbye. Never speed up when reading emails, phone numbers, or confirmations.",
    "- When confirming an email or phone number, slow down and pause between segments.",
    "- Keep sentences under 25 words. Break complex info into short pieces.",
    "- If something goes wrong with a tool or action, never say 'error' or any technical term. Just say 'Let me note that and have someone follow up' and move on.",
  ];
}

function buildCompactWirelineKnowledgeSection(kind: ShowcaseKind): string[] {
  const modeLead =
    kind === "cs"
      ? "- Use this Wireline knowledge as YOUR own working knowledge — paraphrase casually in your normal voice. Never recite as a list."
      : "- Use this Wireline knowledge only when the caller asks about Wireline. Paraphrase in YOUR voice, in the same cadence and warmth as the rest of the call.";

  const modeTail =
    kind === "cs"
      ? "- You are the real Wireline team on this line, not a role-play demo."
      : "- After the Wireline answer, slide back into the role-play with the same energy — no announcement, no pivot phrase like 'anyway' or 'so'.";

  return [
    "WIRELINE KNOWLEDGE:",
    modeLead,
    `- ${WIRELINE_ONE_LINER}`,
    "- Core capabilities: inbound support that answers 24/7, the outbound growth engine, two-way texting, email agents, and supervisor controls (listen/whisper/barge in beta) with CRM sync.",
    `- Growth engine (lead generation): ${WIRELINE_GROWTH_ENGINE}`,
    `- Pricing: ${buildCompactPricingSummary()}.`,
    `- Integrations: ${WIRELINE_INTEGRATIONS.slice(0, 6).join(", ")}, and more.`,
    `- ${buildCompactComplianceSummary()}`,
    `- Voice runtime: ${WIRELINE_VOICE_STACK}`,
    "- MATCH THE CALLER'S PROBLEM TO A CAPABILITY — when they name a pain, lead with the fix in your own words (never read these aloud as a list):",
    ...WIRELINE_PAIN_SOLUTIONS.map((entry) => `    • ${entry.pain} → ${entry.solution}.`),
    modeTail,
  ];
}

/**
 * Demo agents are showcase salespeople: a strong role-play has earned the
 * right to pitch Wireline and ask for the business. This block makes the
 * close explicit (one clear, warm ask — not a polite sign-off) while
 * staying inside the demo boundary: they convert through self-service
 * tools (signup / account / payment link) and NEVER promise a human
 * callback, which a demo line cannot honor.
 */
function buildDemoClosingPlaybook(): string[] {
  return [
    "CLOSE THE DEMO (sales instinct — you are selling Wireline):",
    "- Once you have demonstrated the skill well, you have earned the pitch. Do NOT just end politely — turn into Wireline's salesperson.",
    "- Name the value the caller just watched you deliver, tie it directly to the problem or goal they told you about, then make ONE clear ask.",
    "- Default ask: offer to email a free-trial link so they can stand this up for their own business today — then capture their email, read it back, get an explicit yes, and call send_signup_link.",
    "- If they are eager to start now, use create_account. If they are ready to buy, use send_payment_link. Match the tool to their readiness.",
    "- Handle at most one objection with a short, honest answer (price, 'it sounds like AI', 'I need to think about it'), then re-ask for the micro-commitment.",
    "- Stay warm and confident, never pushy: one clear ask, not three. If they decline, leave the door open and offer the signup link for whenever they are ready.",
  ];
}

function buildWirelineEmployeePrompt(agent: ContactAgent): string {
  return [
    `You are ${agent.name}, a real Wireline employee on a real Wireline line.`,
    `Role: ${agent.role}. Scope: ${agent.scope}`,
    `Topics you handle: ${agent.handles}.`,
    "IDENTITY RULES:",
    "- You are not a showcase demo or role-play.",
    "- Speak like Wireline's own front-line team: confident, concise, and operationally sharp.",
    ...buildSharedOpeningRules(),
    ...buildSharedConversationStyle(agent),
    ...buildWirelineEmployeePersona(agent),
    "WIRELINE EMPLOYEE STANDARD:",
    "- Handle product, signup, billing, onboarding, and technical questions directly.",
    "- Use the Wireline knowledge below proactively when the caller is asking about Wireline.",
    "- Move straight to signup or payment when the caller is ready.",
    ...buildCompactWirelineKnowledgeSection("cs"),
    "TOOL RULES:",
    "- Use send_signup_link when they want the trial or product details by email.",
    "- Use create_account when they want to start now.",
    "- Use send_payment_link when they are ready to buy.",
    "- Use schedule_callback only after the caller gives a specific callback time.",
    "- Use escalate_to_human when they ask for a person, emotions are high, or the issue is risky.",
    "- For every email tool, ask for the email, read the full address back, and get an explicit yes before calling the tool.",
    "TRUTH RULES:",
    "- If asked whether you are AI, say yes clearly and keep helping.",
    "- Never promise compliance, integrations, or pricing beyond the knowledge above.",
    "- NEVER tell the caller an email was sent unless a send_signup_link or send_payment_link tool result starts with DELIVERY_OK. If it says DELIVERY_FAILED, read the URL from the tool result aloud instead.",
  ].join("\n");
}

export function buildShowcaseSystemPrompt(agent: ContactAgent, kind: ShowcaseKind): string {
  return kind === "cs" ? buildWirelineEmployeePrompt(agent) : buildDemoShowcasePrompt(agent);
}

export function buildShowcaseFunctionTools(kind: ShowcaseKind) {
  return showcaseToolNamesForKind(kind).map((toolName) => {
    const tool = SHOWCASE_TOOL_DEFS[toolName];
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  });
}

export function buildShowcaseAssistantPayload(
  agent: ContactAgent,
  kind: ShowcaseKind,
  options?: {
    serverUrlSecret?: string;
    provider?: string;
    model?: string;
    existingVoiceId?: string;
  },
) {
  const voiceSelection = resolveVapiVoiceModelSelection({
    provider: options?.provider ?? VAPI_SHOWCASE_PROVIDER,
    model: options?.model ?? VAPI_SHOWCASE_MODEL,
  });

  const transcriberMode: VapiTranscriberMode = agent.transcriberMode ?? "flux-eot";
  const speechPipeline = resolveVapiSpeechPipeline(transcriberMode);

  const payload: Record<string, any> = {
    name: showcaseVapiAssistantName(agent),
    firstMessage: agent.firstMessage,
    model: {
      provider: voiceSelection.provider,
      model: voiceSelection.model,
      temperature: 0.1,
      maxTokens: 300,
      messages: [{ role: "system", content: buildShowcaseSystemPrompt(agent, kind) }],
      tools: buildShowcaseFunctionTools(kind),
      ...(voiceSelection.fallbackModels?.length
        ? { fallbackModels: voiceSelection.fallbackModels }
        : {}),
    },
    serverUrl: SHOWCASE_WEBHOOK_URL,
    responseDelaySeconds: 0,
    numWordsToInterruptAssistant: 2,
    backgroundDenoisingEnabled: false,
    backchannelingEnabled: true,
    backgroundSound: "office",
    clientMessages: [
      "transcript",
      "hang",
      "function-call",
      "speech-update",
      "metadata",
      "conversation-update",
    ],
    serverMessages: ["end-of-call-report", "status-update", "hang", "function-call"],
    startSpeakingPlan: speechPipeline.startSpeakingPlan,
    transcriber: speechPipeline.transcriber,
    analysisPlan: {
      summaryPrompt:
        "Summarize this call in 2-3 sentences. Focus on: (1) what the caller wanted, (2) what the agent did, (3) any follow-up the agent committed to.",
      structuredDataPrompt: "Extract structured data from this call.",
      structuredDataSchema: {
        type: "object",
        properties: {
          caller_intent: {
            type: "string",
            description:
              "One of: book_appointment, ask_question, complaint, sales_inquiry, support, transfer_request, other",
          },
          outcome: {
            type: "string",
            description:
              "One of: resolved, scheduled, transferred, voicemail, unresolved, callback_needed",
          },
          commitments: {
            type: "array",
            items: { type: "string" },
            description:
              "List of any commitments the agent made (e.g., 'will send invoice by 5pm', 'will call back tomorrow')",
          },
          sentiment: {
            type: "string",
            description: "One of: positive, neutral, negative, frustrated",
          },
        },
      },
      successEvaluationPrompt:
        "Did the agent successfully address what the caller wanted? Reply with 'true' or 'false' only.",
    },
    metadata: {
      wireline_transcriber_mode: transcriberMode,
      wireline_showcase_agent: agent.name,
    },
  };

  const voiceId = agent.voiceId || options?.existingVoiceId;
  if (voiceId) {
    const tuning = agent.voiceSettings ?? {};
    payload.voice = {
      provider: "11labs",
      voiceId,
      model: "eleven_flash_v2_5",
      optimizeStreamingLatency: 4,
      stability: tuning.stability ?? 0.65,
      similarityBoost: tuning.similarityBoost ?? 0.88,
      style: tuning.style ?? 0.05,
      useSpeakerBoost: true,
      // ElevenLabs speech speed. Individual agents override via
      // voiceSettings.speed in contact-agents.ts; this default sits at
      // the neutral 1.0 — no artificial slowdown. The old 0.95 nudge
      // added perceptible dead-air without a cadence benefit large
      // enough to justify ~50ms per TTS chunk. Per-agent speed tuning
      // (Marcus calm at 0.95, Jake energetic at 1.06) lives in the
      // contact-agents roster, not here.
      // ElevenLabs accepts 0.7–1.2; Vapi forwards as voice.eleven_labs.speed.
      speed: tuning.speed ?? 1.0,
      fallbackPlan: {
        voices: [
          {
            provider: "vapi",
            voiceId: "Elliot",
          },
        ],
      },
    };
  }

  if (options?.serverUrlSecret) {
    payload.serverUrlSecret = options.serverUrlSecret;
  }

  return payload;
}

export function findShowcaseAgentByPhoneNumber(phoneNumber?: string | null): ShowcaseMatch | null {
  const normalized = normalizeShowcasePhone(phoneNumber);
  if (!normalized) return null;
  return SHOWCASE_DIRECTORY.get(normalized) || null;
}

export function extractShowcaseDialedNumber(payload: Record<string, unknown>): string | null {
  const call = (payload.call || null) as {
    phoneNumber?: string | { number?: string };
  } | null;
  const message = (payload.message || null) as {
    call?: {
      phoneNumber?: string | { number?: string };
    };
  } | null;

  const candidates = [
    typeof call?.phoneNumber === "string" ? call.phoneNumber : call?.phoneNumber?.number,
    typeof message?.call?.phoneNumber === "string"
      ? message.call.phoneNumber
      : message?.call?.phoneNumber?.number,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return null;
}

export function findShowcaseAgentByPayload(payload: Record<string, unknown>): ShowcaseMatch | null {
  return findShowcaseAgentByPhoneNumber(extractShowcaseDialedNumber(payload));
}
