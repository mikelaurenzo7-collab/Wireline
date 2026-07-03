import { AppError } from "./api-error";

export const AGENT_CUSTOMIZATION_VERSION = 1 as const;
export const AGENT_ROLES = ["receptionist", "scheduler", "sales", "customer_service"] as const;
export const AGENT_ESCALATION_POLICIES = [
  "take_message",
  "handoff_when_configured",
  "never",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];
export type AgentEscalationPolicy = (typeof AGENT_ESCALATION_POLICIES)[number];

export interface AgentCustomizationProfile {
  version: typeof AGENT_CUSTOMIZATION_VERSION;
  identity: {
    name: string;
    businessName: string;
    role: AgentRole;
    tone: string;
  };
  mission: {
    primaryGoal: string;
    successCriteria: string[];
  };
  behavior: {
    rules: string[];
    prohibitedTopics: string[];
    allowedActions: string[];
    escalationPolicy: AgentEscalationPolicy;
  };
  knowledge: {
    summary: string;
  };
  lifecycle: "draft";
  source: "chatgpt_mcp" | "claude_mcp" | "web" | "ios" | "android";
}

export interface AgentCustomizationInput {
  agent_name?: unknown;
  business_name?: unknown;
  role?: unknown;
  tone?: unknown;
  primary_goal?: unknown;
  success_criteria?: unknown;
  rules?: unknown;
  prohibited_topics?: unknown;
  allowed_actions?: unknown;
  escalation_policy?: unknown;
  knowledge_summary?: unknown;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function uniqueTextList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const normalized = text(item, maxLength);
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= maxItems) break;
  }
  return result;
}

function role(value: unknown): AgentRole {
  return AGENT_ROLES.includes(value as AgentRole) ? (value as AgentRole) : "receptionist";
}

function escalationPolicy(value: unknown): AgentEscalationPolicy {
  return AGENT_ESCALATION_POLICIES.includes(value as AgentEscalationPolicy)
    ? (value as AgentEscalationPolicy)
    : "take_message";
}

function defaultName(agentRole: AgentRole, businessName: string): string {
  const label = businessName || "Wireline";
  switch (agentRole) {
    case "scheduler":
      return `${label} Scheduling Assistant`;
    case "sales":
      return `${label} Sales Assistant`;
    case "customer_service":
      return `${label} Support Assistant`;
    default:
      return `${label} Receptionist`;
  }
}

function defaultGoal(agentRole: AgentRole): string {
  switch (agentRole) {
    case "scheduler":
      return "Understand scheduling needs, collect the details needed for a next step, and keep the calendar conversation moving.";
    case "sales":
      return "Qualify inbound interest, understand the prospect's need, and move the conversation to a clear next step.";
    case "customer_service":
      return "Resolve common questions accurately, capture unresolved details, and make the next step clear.";
    default:
      return "Answer professionally, understand what the caller needs, and capture a clear next step.";
  }
}

function defaultRules(agentRole: AgentRole): string[] {
  const shared = [
    "Be truthful about what you know and never invent availability, pricing, policies, or completed actions.",
    "Use short, natural spoken turns and ask one useful question at a time.",
    "Capture a concise next step when the request cannot be completed in the conversation.",
  ];
  if (agentRole === "scheduler") {
    return [
      ...shared,
      "Do not confirm an appointment until the connected scheduling policy explicitly permits it.",
    ];
  }
  if (agentRole === "sales") {
    return [
      ...shared,
      "Qualify fit before recommending a next step and do not make pricing commitments.",
    ];
  }
  return shared;
}

/**
 * Canonical customization normalizer. Every client may collect different UI fields,
 * but they become this same bounded profile before the runtime, policy engine, or
 * persistence layer sees them.
 */
export function normalizeAgentCustomization(
  input: AgentCustomizationInput,
  source: AgentCustomizationProfile["source"] = "chatgpt_mcp",
): AgentCustomizationProfile {
  const selectedRole = role(input.role);
  const businessName = text(input.business_name, 120) || "Your business";
  const name = text(input.agent_name, 120) || defaultName(selectedRole, businessName);
  const primaryGoal = text(input.primary_goal, 700) || defaultGoal(selectedRole);
  const tone = text(input.tone, 120) || "warm, concise, and capable";
  const rules = uniqueTextList(input.rules, 12, 320);
  const prohibitedTopics = uniqueTextList(input.prohibited_topics, 16, 160);
  const allowedActions = uniqueTextList(input.allowed_actions, 12, 120);
  const successCriteria = uniqueTextList(input.success_criteria, 8, 180);
  const knowledgeSummary = text(input.knowledge_summary, 1800);

  return {
    version: AGENT_CUSTOMIZATION_VERSION,
    identity: { name, businessName, role: selectedRole, tone },
    mission: { primaryGoal, successCriteria },
    behavior: {
      rules: rules.length ? rules : defaultRules(selectedRole),
      prohibitedTopics,
      allowedActions,
      escalationPolicy: escalationPolicy(input.escalation_policy),
    },
    knowledge: { summary: knowledgeSummary },
    lifecycle: "draft",
    source,
  };
}

export function isAgentCustomizationProfile(value: unknown): value is AgentCustomizationProfile {
  const profile =
    value && typeof value === "object" ? (value as Partial<AgentCustomizationProfile>) : null;
  return Boolean(
    profile &&
    profile.version === AGENT_CUSTOMIZATION_VERSION &&
    profile.identity &&
    typeof profile.identity.name === "string" &&
    profile.mission &&
    typeof profile.mission.primaryGoal === "string" &&
    profile.behavior &&
    Array.isArray(profile.behavior.rules),
  );
}

/**
 * The runtime prompt is compiled from the profile. Clients never compose their own
 * runtime instructions, which keeps Web, MCP, iOS, and Android behavior aligned.
 */
export function compileAgentRuntimeInstructions(profile: AgentCustomizationProfile): string {
  const rules = profile.behavior.rules.map((item, index) => `${index + 1}. ${item}`).join("\n");
  const prohibited = profile.behavior.prohibitedTopics.length
    ? profile.behavior.prohibitedTopics.join(", ")
    : "No additional prohibited topics were specified.";
  const actions = profile.behavior.allowedActions.length
    ? profile.behavior.allowedActions.join(", ")
    : "No external action is assumed to be available until configured and approved in Wireline.";
  const success = profile.mission.successCriteria.length
    ? profile.mission.successCriteria.map((item) => `- ${item}`).join("\n")
    : "- Leave the person with one clear next step.";
  const knowledge =
    profile.knowledge.summary || "No account-holder knowledge summary has been added yet.";
  const escalation =
    profile.behavior.escalationPolicy === "handoff_when_configured"
      ? "Escalate to a human only when a configured handoff path is available; otherwise take a concise message."
      : profile.behavior.escalationPolicy === "never"
        ? "Do not offer a human handoff; capture a concise next step instead."
        : "Take a concise message and identify the appropriate follow-up when a human is needed.";

  return [
    "# Identity",
    `You are ${profile.identity.name}, a ${profile.identity.role.replace(/_/g, " ")} for ${profile.identity.businessName}.`,
    "",
    "# Mission",
    profile.mission.primaryGoal,
    "",
    "# Success criteria",
    success,
    "",
    "# Voice and style",
    `Speak in a ${profile.identity.tone} style. Use natural spoken language, calm pacing, and concise turns.`,
    "",
    "# Account-holder rules",
    rules,
    "",
    "# Knowledge available",
    knowledge,
    "",
    "# Action boundary",
    `The account holder intends for this agent to support: ${actions}`,
    "No external action is assumed to be available unless it is configured and approved in Wireline.",
    "Never claim an appointment was booked, a message was sent, a call was transferred, a payment was taken, or any external action was completed unless the configured tool returned a successful result in the current conversation.",
    "",
    "# Escalation",
    escalation,
    "",
    "# Prohibited topics",
    prohibited,
    "",
    "# Safety",
    "Do not invent exact names, phone numbers, availability, pricing, policies, or records. When unsure, state the limitation briefly and capture the next useful step.",
  ].join("\n");
}

export function profileToBusinessVariables(
  profile: AgentCustomizationProfile,
): Record<string, unknown> {
  return {
    customizationVersion: profile.version,
    source: profile.source,
    businessName: profile.identity.businessName,
    primaryGoal: profile.mission.primaryGoal,
    successCriteria: profile.mission.successCriteria,
    tone: profile.identity.tone,
    allowedActions: profile.behavior.allowedActions,
    escalationPolicy: profile.behavior.escalationPolicy,
    knowledgeSummary: profile.knowledge.summary,
  };
}

export function assertDraftConfirmation(value: unknown): asserts value is true {
  if (value !== true) {
    throw AppError.fromHttpStatus(
      400,
      "Confirm that you want to create or update this private Wireline agent draft before continuing.",
    );
  }
}
