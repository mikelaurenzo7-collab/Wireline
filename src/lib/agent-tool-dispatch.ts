/* eslint-disable @typescript-eslint/no-explicit-any */
/** Shared dispatch for live agent tools and Director-approved integration jobs. */
import { randomUUID } from "node:crypto";

import { handleCalendarToolCall } from "../routes/vapi/tool-handlers-calendar";
import { handleCoreToolCall } from "../routes/vapi/tool-handlers-core";
import { handleDeviceToolCall } from "../routes/vapi/tool-handlers-device";
import { handleEnrichmentToolCall } from "../routes/vapi/tool-handlers-enrichment";
import { handleNotificationToolCall } from "../routes/vapi/tool-handlers-notifications";
import { handleShopifyToolCall } from "../routes/vapi/tool-handlers-shopify";
import { handleSquareToolCall } from "../routes/vapi/tool-handlers-square";
import type { ToolCallContext, ToolCallResult } from "../routes/vapi/types";
import { handleWorkflowToolCall } from "../routes/vapi/tool-handlers-workflow";
import { handleXToolCall } from "../routes/vapi/tool-handlers-x";
import { isAgentToolExecutionAuthorized } from "./agent-tool-authorization";
import { runIdempotentAgentToolCall } from "./agent-tool-idempotency";
import { handleNativeVoiceToolCall } from "./agent-tool-native-voice";
import { enforceAgentToolResultTruth } from "./agent-tool-result-truth";
import { drizzle, log } from "./server-context";

async function dispatchToFirstAvailableHandler(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult> {
  const handlers = [
    // Native outbound calls carry a signed exact lead id. Resolve mutating
    // lead tools against that row before legacy phone-number fallback handlers.
    handleNativeVoiceToolCall,
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
  let authorized = false;
  try {
    authorized = await isAgentToolExecutionAuthorized(fn, context);
  } catch (error) {
    context.log.error("Agent tool authorization failed closed", {
      tool: fn,
      agentId: context.agent?.id,
      toolCallId: context.toolCallId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!authorized) {
    context.log.warn("Blocked inactive or disconnected agent tool", {
      tool: fn,
      agentId: context.agent?.id,
      toolCallId: context.toolCallId,
    });
    return {
      toolCallId: context.toolCallId,
      result:
        "That action is not enabled for this agent or its required connection is unavailable. Do not claim it ran. Offer an enabled alternative or create a follow-up task.",
    };
  }

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
    toolCallId: input.toolCallId || `director-${randomUUID()}`,
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
