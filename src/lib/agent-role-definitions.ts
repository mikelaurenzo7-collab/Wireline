import { ROLE_PERSONALITY_TEMPLATES } from "./agent-constants";

/** Canonical agent role ids — keys of server personality templates plus explicit custom. */
export const AGENT_ROLE_IDS = [
  "ceo",
  "sales",
  "customer_service",
  "scheduler",
  "collections",
  "technical_support",
  "lead_qualifier",
  "receptionist",
  "personal_assistant",
  "marketing",
  "custom",
] as const;

export type AgentRoleId = (typeof AGENT_ROLE_IDS)[number];

/** Runtime fallback when an agent row has no role. */
export const DEFAULT_AGENT_ROLE_ID: AgentRoleId = "ceo";

/** Default role when create payloads omit `role` (web + mobile). */
export const AGENT_CREATE_DEFAULT_ROLE_ID: AgentRoleId = "ceo";

/** Legacy ids accepted on read / archetype resolution only — not for new creates. */
const LEGACY_ROLE_ALIASES: Record<string, AgentRoleId> = {
  appointment_scheduler: "scheduler",
  director: "ceo",
  general_manager: "ceo",
  operator: "ceo",
  best_employee: "ceo",
  right_hand: "ceo",
};

export type AgentRoleDefinition = {
  id: AgentRoleId;
  label: string;
  archetype: string;
  description: string;
};

const ROLE_META: Record<AgentRoleId, Omit<AgentRoleDefinition, "id">> = {
  ceo: {
    label: "Wireline Operator",
    archetype: "All-Purpose AI Employee",
    description:
      "Handles sales, marketing, front desk, support, scheduling, follow-up, recovery, and personal admin under owner-controlled rules",
  },
  sales: {
    label: "Sales",
    archetype: "Sales Representative",
    description: "Closes deals and drives revenue",
  },
  customer_service: {
    label: "Customer Service",
    archetype: "Customer Support",
    description: "Handles inbound issues and support",
  },
  scheduler: {
    label: "Scheduler",
    archetype: "Appointment Scheduler",
    description: "Books appointments and manages calendars",
  },
  collections: {
    label: "Collections",
    archetype: "Collections Specialist",
    description: "Handles payment follow-ups and recovery",
  },
  technical_support: {
    label: "Technical Support",
    archetype: "Technical Support Specialist",
    description: "Diagnoses and resolves technical issues",
  },
  lead_qualifier: {
    label: "Lead Qualifier",
    archetype: "Lead Qualification Specialist",
    description: "Screens and scores inbound prospects",
  },
  receptionist: {
    label: "Receptionist",
    archetype: "Receptionist",
    description: "Routes calls and creates first impressions",
  },
  personal_assistant: {
    label: "Personal Assistant",
    archetype: "Personal Assistant",
    description: "Protects principal time and handles personal logistics",
  },
  marketing: {
    label: "Marketing",
    archetype: "Marketing Engagement Specialist",
    description: "Nurtures prospects and runs campaigns",
  },
  custom: {
    label: "Custom",
    archetype: "Custom Assistant",
    description: "Fully custom role and behavior",
  },
};

export const AGENT_ROLE_DEFINITIONS: readonly AgentRoleDefinition[] = AGENT_ROLE_IDS.map((id) => ({
  id,
  ...ROLE_META[id],
}));

export function isKnownAgentRoleId(value: string): value is AgentRoleId {
  return (AGENT_ROLE_IDS as readonly string[]).includes(value);
}

export function normalizeAgentRoleId(value: string | undefined | null): AgentRoleId | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (isKnownAgentRoleId(trimmed)) return trimmed;
  const alias = LEGACY_ROLE_ALIASES[trimmed];
  return alias ?? null;
}

export function listAgentRolesForApi(): Array<{ id: string; label: string; archetype: string }> {
  return AGENT_ROLE_DEFINITIONS.map(({ id, label, archetype }) => ({ id, label, archetype }));
}

export function resolveAgentRoleArchetype(role: string | undefined | null): string {
  const normalized = normalizeAgentRoleId(role);
  if (normalized) return ROLE_META[normalized].archetype;
  return "Assistant";
}

export function resolveAgentRoleDefinition(
  role: string | undefined | null,
): AgentRoleDefinition | null {
  const normalized = normalizeAgentRoleId(role);
  if (!normalized) return null;
  return { id: normalized, ...ROLE_META[normalized] };
}

/** Validates create/update role payloads — returns an error message or null. */
export function validateAgentRoleForCreate(role: string): string | null {
  const normalized = normalizeAgentRoleId(role.trim());
  if (!normalized) {
    return `Unknown agent role "${role.trim()}". Use GET /api/agents/roles for allowed values.`;
  }
  if (!(normalized in ROLE_PERSONALITY_TEMPLATES) && normalized !== "custom") {
    return `Agent role "${normalized}" is not configured for personality templates.`;
  }
  return null;
}

/** Canonical role id for persistence after validation passes. */
export function canonicalizeAgentRoleForCreate(role: string): AgentRoleId {
  return normalizeAgentRoleId(role.trim()) ?? AGENT_CREATE_DEFAULT_ROLE_ID;
}
