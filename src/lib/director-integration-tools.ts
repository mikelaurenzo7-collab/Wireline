/**
 * OAuth-backed agent tools the Director may propose as integration_jobs.
 * Comms (email / SMS / calls) use `actions` instead — not listed here.
 */
import { AGENT_TOOL_CATALOG, type AgentToolName } from "./agent-capabilities";

const EXCLUDED: ReadonlySet<AgentToolName> = new Set(["send_text_message", "lookup_phone_number"]);

const PLATFORM_RESEARCH_TOOLS: readonly AgentToolName[] = ["gemini_ground"];

export const DIRECTOR_INTEGRATION_TOOLS: readonly AgentToolName[] = [
  ...new Set([
    ...AGENT_TOOL_CATALOG.filter(
      (entry) => entry.integration && entry.integration !== "twilio" && !EXCLUDED.has(entry.name),
    ).map((entry) => entry.name),
    ...PLATFORM_RESEARCH_TOOLS,
  ]),
] as AgentToolName[];

export function isDirectorIntegrationTool(tool: string): tool is AgentToolName {
  return (DIRECTOR_INTEGRATION_TOOLS as readonly string[]).includes(tool);
}
