/**
 * Shared create-path defaults so Fast Start, templates, and mobile all seed
 * agents with a focused live-runtime tool posture. Every capability remains
 * selectable in Studio; creation activates only the tools relevant to the
 * agent's role so the voice model has fewer ambiguous actions to choose from.
 */
import { ROLE_PERSONALITY_TEMPLATES } from "./agent-constants";
import { BUSINESS_TOOL_NAMES, getRoleToolSet, type AgentToolName } from "./agent-capabilities";
import { composeAgentPersonality, TEMPLATE_OVERLAYS } from "./template-overlays";

/** Default Fast Start role when the Account Holder chooses personal posture. */
export const PERSONAL_FAST_START_ROLE = "personal_assistant" as const;

/** Concierge overlay applied when personal Fast Start has no explicit template. */
export const PERSONAL_DEFAULT_TEMPLATE_ID = "personal-concierge" as const;

/**
 * Device actions dispatch directly to the Account Holder's phone. They remain
 * explicit opt-ins and are never granted by a web/mobile/template create path.
 */
const CREATE_PATH_DEVICE_ACTIONS = new Set<AgentToolName>([
  "navigate_to",
  "add_reminder",
  "play_music",
]);

function runtimeRole(role: string, isBusinessAgent: boolean): string {
  if (!isBusinessAgent && (role === "ceo" || role === "custom")) {
    return PERSONAL_FAST_START_ROLE;
  }
  return role;
}

export function resolveCreateEnabledTools(role: string, isBusinessAgent: boolean): AgentToolName[] {
  const candidateTools = getRoleToolSet(runtimeRole(role, isBusinessAgent));

  return candidateTools.filter(
    (tool) =>
      !CREATE_PATH_DEVICE_ACTIONS.has(tool) && (isBusinessAgent || !BUSINESS_TOOL_NAMES.has(tool)),
  );
}

export function resolveCreatePersonality(opts: {
  role: string;
  isBusinessAgent: boolean;
  templateId?: string | null;
  /**
   * Retained for create-call compatibility. An agent's name is never the
   * Account Holder, principal, or business name and must not fill those tokens.
   */
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

  const composed = composeAgentPersonality({
    rolePersonality: rolePersonality || ROLE_PERSONALITY_TEMPLATES.personal_assistant,
    templateId,
  });

  // Personal overlays share the business-template token system. Their safe
  // generic subject is the principal, never the agent and never "your business."
  return opts.isBusinessAgent
    ? composed
    : composed.replace(/\byour business\b/gi, "your principal");
}

/** Infer is_business_agent when template deploy omits the flag. */
export function isBusinessTemplateCategory(category: string | null | undefined): boolean {
  const normalized = (category || "").trim().toLowerCase();
  if (!normalized) return true;
  return !normalized.includes("personal");
}
