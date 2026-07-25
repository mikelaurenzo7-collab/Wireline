/**
 * Shared create-path defaults so Fast Start, templates, and mobile all seed
 * personal agents with the same personality depth and tool posture as the
 * polished Personal & Lifestyle templates.
 */
import { ROLE_PERSONALITY_TEMPLATES } from "./agent-constants";
import {
  BUSINESS_TOOL_NAMES,
  getDefaultAgentTools,
  getRoleToolSet,
  type AgentToolName,
} from "./agent-capabilities";
import { composeAgentPersonality, TEMPLATE_OVERLAYS } from "./template-overlays";

/** Default Fast Start role when the Account Holder chooses personal posture. */
export const PERSONAL_FAST_START_ROLE = "personal_assistant" as const;

/** Concierge overlay applied when personal Fast Start has no explicit template. */
export const PERSONAL_DEFAULT_TEMPLATE_ID = "personal-concierge" as const;

export function resolveCreateEnabledTools(role: string, isBusinessAgent: boolean): AgentToolName[] {
  if (isBusinessAgent) return getDefaultAgentTools();
  const toolRole = role === "ceo" || role === "custom" ? PERSONAL_FAST_START_ROLE : role;
  return getRoleToolSet(toolRole).filter((tool) => !BUSINESS_TOOL_NAMES.has(tool));
}

export function resolveCreatePersonality(opts: {
  role: string;
  isBusinessAgent: boolean;
  templateId?: string | null;
  agentName?: string | null;
}): string | null {
  const rolePersonality =
    ROLE_PERSONALITY_TEMPLATES[opts.role] ||
    (!opts.isBusinessAgent ? ROLE_PERSONALITY_TEMPLATES.personal_assistant : "") ||
    "";

  const explicitTemplate =
    opts.templateId && TEMPLATE_OVERLAYS[opts.templateId] ? opts.templateId : null;
  const personalDefaultOverlay =
    !opts.isBusinessAgent &&
    !explicitTemplate &&
    opts.role === PERSONAL_FAST_START_ROLE &&
    TEMPLATE_OVERLAYS[PERSONAL_DEFAULT_TEMPLATE_ID]
      ? PERSONAL_DEFAULT_TEMPLATE_ID
      : null;
  const templateId = explicitTemplate || personalDefaultOverlay;

  if (!templateId) {
    return rolePersonality.trim() || null;
  }

  return composeAgentPersonality({
    rolePersonality: rolePersonality || ROLE_PERSONALITY_TEMPLATES.personal_assistant,
    templateId,
    businessContext: opts.agentName ? { businessName: opts.agentName } : undefined,
  });
}

/** Infer is_business_agent when template deploy omits the flag. */
export function isBusinessTemplateCategory(category: string | null | undefined): boolean {
  const normalized = (category || "").trim().toLowerCase();
  if (!normalized) return true;
  return !normalized.includes("personal");
}
