type McpDraftSource = "chatgpt_mcp" | "claude_mcp" | "cursor_mcp";

export function mcpVoiceSimulationMeta(input: {
  draftSource: McpDraftSource;
  session: Record<string, unknown>;
  agentId: string;
  greeting: string;
}): { realtime_session?: Record<string, unknown>; agent_id: string } {
  if (input.draftSource === "chatgpt_mcp") {
    return {
      realtime_session: { ...input.session, greeting: input.greeting },
      agent_id: input.agentId,
    };
  }
  return { agent_id: input.agentId };
}
