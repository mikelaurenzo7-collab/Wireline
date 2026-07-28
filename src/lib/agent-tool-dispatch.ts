/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared dispatch for agent tool handlers — used by Vapi webhooks and
 * Director-approved integration jobs.
 */
import { drizzle, log } from "./server-context";
import { handleCalendarToolCall } from "../routes/vapi/tool-handlers-calendar";
import { handleCoreToolCall } from "../routes/vapi/tool-handlers-core";
import { handleEnrichmentToolCall } from "../routes/vapi/tool-handlers-enrichment";
import { handleNotificationToolCall } from "../routes/vapi/tool-handlers-notifications";
import { handleXToolCall } from "../routes/vapi/tool-handlers-x";
import { handleShopifyToolCall } from "../routes/vapi/tool-handlers-shopify";
import { handleSquareToolCall } from "../routes/vapi/tool-handlers-square";
import { handleWorkflowToolCall } from "../routes/vapi/tool-handlers-workflow";
import { handleDeviceToolCall } from "../routes/vapi/tool-handlers-device";
import { runIdempotentAgentToolCall } from "./agent-tool-idempotency";
import { enforceAgentToolResultTruth } from "./agent-tool-result-truth";
import type { ToolCallContext, ToolCallResult } from "../routes/vapi/types";

async function dispatchToFirstAvailableHandler(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult> {
  const handlers = [
    handleCoreToolCall,
    handleCalendarToolCall,
    handleEnrichmentToolCall,
    handleNotificationToolCall,
    handleXToolCall,
    handleWorkflowToolCall,
    handleShopifyToolCall,
    handleSquareToolCall,
    handleDeviceToolCall,
  ];

  for (const handler of handlers) {
    const result = await handler(fn, args, context);
    if (result) return enforceAgentToolResultTruth(fn, result);
  }

  return {
    toolCallId: context.toolCallId,
    result:
      "That action isn't available right now. Try another approach or connect the integration.",
  };
}

export async function dispatchAgentToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult> {
  return runIdempotentAgentToolCall(fn, context, () =>
    dispatchToFirstAvailableHandler(fn, args, context),
  );
}

export function buildDirectorToolContext(input: {
  userId: string;
  agentId: string;
  agentName?: string | null;
  toolCallId?: string;
}): ToolCallContext {
  return {
    toolCallId: input.toolCallId || `director-${Date.now()}`,
    payload: {},
    message: {},
    agent: {
      id: input.agentId,
      user_id: input.userId,
    },
    webhookAgentId: input.agentId,
    agentVoiceName: input.agentName || undefined,
    drizzle,
    log,
  };
}
