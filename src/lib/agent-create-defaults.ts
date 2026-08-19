/**
 * Shared create-path defaults so Fast Start, templates, and mobile all seed
 * agents with a focused live-runtime tool posture. Every capability remains
 * selectable in Studio; creation activates only the tools relevant to the
 * agent's role so the voice model has fewer ambiguous actions to choose from.
 *
 * Personal vs business is not a capability split. Role chooses the tool set.
 * Concierge overlay applies when the customer picks the Concierge role.
 */
import { ROLE_PERSONALITY_TEMPLATES } from "./agent-constants";
import { getRoleToolSet, type AgentToolName } from "./agent-capabilities";
import { composeAgentPersonality, TEMPLATE_OVERLAYS } from "./template-overlays";

/** Default Fast Start role when the customer picks Concierge. */
export const PERSONAL_FAST_START_ROLE = "personal_assistant" as const;

/** Concierge overlay applied when Fast Start selects the Concierge role. */
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

export function resolveCreateEnabledTools(role: string, _isBusinessAgent: boolean): AgentToolName[] {
  const candidateTools = getRoleToolSet(role);

  return candidateTools.filter((tool) => !CREATE_PATH_DEVICE_ACTIONS.has(tool));
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
    ROLE_PERSONALITY_TEMPLATES[opts.role] || ROLE_PERSONALITY_TEMPLATES.ceo || "";

  const explicitTemplate =
    opts.templateId && TEMPLATE_OVERLAYS[opts.templateId] ? opts.templateId : null;
  const conciergeOverlay =
    !explicitTemplate &&
    opts.role === PERSONAL_FAST_START_ROLE &&
    TEMPLATE_OVERLAYS[PERSONAL_DEFAULT_TEMPLATE_ID]
      ? PERSONAL_DEFAULT_TEMPLATE_ID
      : null;
  const templateId = explicitTemplate || conciergeOverlay;

  if (!templateId) {
    return rolePersonality.trim() || null;
  }

  const composed = composeAgentPersonality({
    rolePersonality: rolePersonality || ROLE_PERSONALITY_TEMPLATES.personal_assistant,
    templateId,
  });

  // Concierge overlays share the template token system. Their safe generic
  // subject is the principal, never the agent and never "your business."
  return opts.role === PERSONAL_FAST_START_ROLE
    ? composed.replace(/\byour business\b/gi, "your principal")
    : composed;
}

/** Templates deploy as capable voice agents. Category is a use-case label only. */
export function isBusinessTemplateCategory(_category: string | null | undefined): boolean {
  return true;
}
