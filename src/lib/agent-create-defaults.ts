/**
 * Shared create-path defaults so Fast Start, the web app, and mobile all seed
 * Bots the same way. BotBound ships one Bot, so creation no longer narrows the
 * toolbox by role: a new Bot starts with the whole catalog it is allowed to
 * hold, and the Account Holder turns individual actions off in Studio.
 */
import {
  BUSINESS_TOOL_NAMES,
  getDefaultAgentTools,
  type AgentToolName,
} from "./agent-capabilities";
import { composeAgentPersonality } from "./agent-personality";

const UNRESOLVED_GREETING_TOKEN = /\[[^\]]+\]|\{\{?[^{}]+\}\}?/;

export function resolveCreateFirstMessage(raw: unknown, agentName: string): string {
  const fallback = `Hi, this is ${agentName}. How can I help?`;
  if (typeof raw !== "string") return fallback;
  const value = raw.trim().slice(0, 500);
  if (!value || UNRESOLVED_GREETING_TOKEN.test(value)) return fallback;
  return value;
}

/**
 * Device actions dispatch directly to the Account Holder's phone. They remain
 * explicit opt-ins and are never granted by a web/mobile create path.
 */
const CREATE_PATH_DEVICE_ACTIONS = new Set<AgentToolName>([
  "navigate_to",
  "add_reminder",
  "play_music",
]);

export function resolveCreateEnabledTools(isBusinessAgent: boolean): AgentToolName[] {
  return getDefaultAgentTools().filter(
    (tool) =>
      !CREATE_PATH_DEVICE_ACTIONS.has(tool) && (isBusinessAgent || !BUSINESS_TOOL_NAMES.has(tool)),
  );
}

export function resolveCreatePersonality(opts: {
  isBusinessAgent: boolean;
  /**
   * Retained for create-call compatibility. A Bot's name is never the Account
   * Holder, principal, or business name and must not fill those tokens.
   */
  agentName?: string | null;
}): string {
  return composeAgentPersonality({ isBusinessAgent: opts.isBusinessAgent });
}
