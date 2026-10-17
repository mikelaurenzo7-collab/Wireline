import type { AgentToolName } from "./agent-capabilities";
import type { ToolCallContext, ToolCallResult } from "./agent-tool-types";
import {
  CALLER_LINKED_LIVE_WRITE_DENIAL,
  CALLER_LINKED_LIVE_WRITE_TOOL_NAMES,
  PRIVATE_LIVE_READ_DENIAL,
  PRIVATE_LIVE_READ_TOOL_NAMES,
} from "./unverified-live-tools";

/**
 * Native outbound calls carry an exact lead ID, but the ID does not verify the
 * human who answered. Do not expose or change an existing record from a live
 * voice request until the caller-verification flow is implemented.
 */
export async function handleNativeVoiceToolCall(
  fn: string,
  _args: unknown,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  if (PRIVATE_LIVE_READ_TOOL_NAMES.has(fn as AgentToolName)) {
    return { toolCallId: context.toolCallId, result: PRIVATE_LIVE_READ_DENIAL };
  }
  if (CALLER_LINKED_LIVE_WRITE_TOOL_NAMES.has(fn as AgentToolName)) {
    return { toolCallId: context.toolCallId, result: CALLER_LINKED_LIVE_WRITE_DENIAL };
  }
  return null;
}
