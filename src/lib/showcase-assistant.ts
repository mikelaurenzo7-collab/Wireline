/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent,
} from "../data/contact-agents";
import {
  WIRELINE_COMPLIANCE_STATUS,
  WIRELINE_INTEGRATIONS,
  WIRELINE_ONE_LINER,
  WIRELINE_PLANS,
  WIRELINE_VOICE_STACK,
} from "../data/wireline-knowledge";
import {
  VAPI_SHOWCASE_MODEL,
  VAPI_SHOWCASE_PROVIDER,
  resolveVapiVoiceModelSelection,
} from "./claude-brain";
import { sanitizePhone } from "./vapi-helpers";

export type ShowcaseKind = "cs" | "demo";

export const SHOWCASE_WEBHOOK_URL = "https://trywireline.com/api/vapi-webhook";

export const SHOWCASE_TOOL_NAMES = [
  "send_signup_link",
  "create_account",
  "send_payment_link",
  "schedule_callback",
  "escalate_to_human",
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

export function showcaseToolNamesForKind(kind: ShowcaseKind): ShowcaseToolName[] {
  if (kind === "demo") {
    return SHOWCASE_TOOL_NAMES.filter((name) => !OWNER_ROUTING_TOOL_NAMES.has(name));
  }
  return [...SHOWCASE_TOOL_NAMES];
}

/** True only for owner-routing tools that a demo agent must not be able to fire. */
export function isOwnerRoutingShowcaseTool(toolName: string): boolean {
  return OWNER_ROUTING_TOOL_NAMES.has(toolName as ShowcaseToolName);
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
    "- Ask one question per turn.",
    "- Keep the first three turns under 14 words when possible.",
  ];
}

function buildSharedConversationStyle(agent: ContactAgent): string[] {
  return [
    "CONVERSATION STYLE:",
    `- ${SHOWCASE_VIBE_GUIDE[agent.defaultVibe]}`,
    "- Reply directly. No long preambles, feature dumps, or stacked questions.",
    "- If a short answer works, stop after the answer and one next question.",
    "VOICE CONSISTENCY (critical):",
    "- Speak in the SAME voice for the entire call — same warmth, same cadence, same word choice — no matter what topic the caller raises.",
    "- Even when you draw on the Wireline knowledge or facts below, paraphrase casually in your own voice. NEVER read a bulleted list back. NEVER shift to a formal or corporate register.",
    "- If the caller asks something technical, stay conversational. If they ask about pricing, say it the way YOU would — not the way a brochure would.",
    "- Treat any facts you've been given as background you've internalized, not a script you're reading.",
    "PACING RULES (critical):",
    "- Maintain the SAME speaking speed from greeting to goodbye. Never speed up when reading emails, phone numbers, or confirmations.",
    "- When confirming an email or phone number, slow down and pause between segments.",
    "- Keep sentences under 18 words. Break complex info into short pieces.",
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
    `- Pricing: ${buildCompactPricingSummary()}.`,
    "- Core capabilities: voice calls, two-way texting, email follow-up, CRM sync, and supervisor visibility.",
    `- Integrations: ${WIRELINE_INTEGRATIONS.slice(0, 6).join(", ")}, and more.`,
    `- ${buildCompactComplianceSummary()}`,
    `- Voice runtime: ${WIRELINE_VOICE_STACK}`,
    modeTail,
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
  ].join("\n");
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
    ...buildSharedOpeningRules(),
    ...buildSharedConversationStyle(agent),
    "DEMO STANDARD:",
    "- Keep the role-play believable, fast, and specific to the vertical.",
    "- When the caller asks about Wireline, answer in YOUR voice (warm, conversational, the same rhythm as the rest of the call) — never recite a bulleted list of features.",
    ...buildCompactWirelineKnowledgeSection("demo"),
    "TOOL RULES:",
    "- Use send_signup_link when they want the trial or product details by email.",
    "- Use create_account when they want to start now.",
    "- Use send_payment_link when they are ready to buy.",
    "- For every email tool, ask for the email, read the full address back, and get an explicit yes before calling the tool.",
    "DEMO BOUNDARIES (important):",
    "- You are a demo line. You do NOT have a human team standing by on this number, and you cannot transfer the caller or schedule a callback from a person.",
    "- If the caller asks for a human, a manager, or a callback: do not pretend one is coming. Warmly explain this is a live demo of Wireline, then offer a real next step — email them a signup link, or point them to talk to the Wireline team by starting a free trial.",
    "- Never tell the caller you've 'flagged this for the team' or that 'someone will reach out' — on a demo line that is not true.",
    "TRUTH RULES:",
    "- If asked whether you are AI, say yes clearly and keep helping.",
    "- Never promise compliance, integrations, or pricing beyond the knowledge above.",
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

  const payload: Record<string, any> = {
    firstMessage: agent.firstMessage,
    model: {
      provider: voiceSelection.provider,
      model: voiceSelection.model,
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
    backgroundSound: "off",
    startSpeakingPlan: {
      waitSeconds: 0.05,
      smartEndpointingPlan: { provider: "livekit", waitFunction: "10 + 5000 * x" },
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-3",
      language: "en",
      smartFormat: true,
      endpointing: 40,
    },
    // Prevent TTS speed-up on dense token sequences (emails, phone numbers)
    inputMinCharacters: 30,
  };

  const voiceId = agent.voiceId || options?.existingVoiceId;
  if (voiceId) {
    payload.voice = {
      provider: "11labs",
      voiceId,
      model: "eleven_flash_v2_5",
      optimizeStreamingLatency: 2,
      stability: 0.65,
      similarityBoost: 0.88,
      style: 0.05,
      useSpeakerBoost: true,
      // Nudge the rate of speech just below the 1.0 default for a more
      // controlled, measured cadence. 0.95 is a subtle slow-down — the
      // voice still sounds natural, not sluggish. ElevenLabs accepts
      // 0.7–1.2; Vapi forwards this as voice.eleven_labs.speed.
      // Docs: https://elevenlabs.io/docs/eleven-agents/customization/voice/speed-control
      speed: 0.95,
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
