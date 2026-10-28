/* eslint-disable @typescript-eslint/no-explicit-any */
/** Shared dispatch for live agent tools and Director-approved integration jobs. */
import { randomUUID } from "node:crypto";

import { handleCalendarToolCall } from "./bot-tools/calendar";
import { handleCoreToolCall } from "./bot-tools/core";
import { handleDeviceToolCall } from "./bot-tools/device";
import { handleEnrichmentToolCall } from "./bot-tools/enrichment";
import { handleNotificationToolCall } from "./bot-tools/notifications";
import { handleShopifyToolCall } from "./bot-tools/shopify";
import { handleSquareToolCall } from "./bot-tools/square";
import type { ToolCallContext, ToolCallResult } from "./agent-tool-types";
import { handleWorkflowToolCall } from "./bot-tools/workflow";
import { handleXToolCall } from "./bot-tools/x";
import { isAgentToolExecutionAuthorized } from "./agent-tool-authorization";
import { runIdempotentAgentToolCall } from "./agent-tool-idempotency";
import { handleNativeVoiceToolCall } from "./agent-tool-native-voice";
import { enforceAgentToolResultTruth } from "./agent-tool-result-truth";
import { AppError } from "./api-error";
import {
  getComputerTaskForOwner,
  listComputerTasksForOwner,
  startComputerTask,
} from "./cloud-computer/task-runner";
import { drizzle, log } from "./server-context";

function resolveComputerContextIds(
  context: Partial<ToolCallContext> | undefined,
  args: Record<string, unknown>,
): { userId: string; agentId: string; toolCallId: string } {
  const toolCallId =
    typeof context?.toolCallId === "string" && context.toolCallId.trim()
      ? context.toolCallId.trim()
      : "computer-tool-call";
  const userId =
    (typeof context?.userId === "string" && context.userId.trim()) ||
    (typeof context?.agent?.user_id === "string" && context.agent.user_id.trim()) ||
    "";
  const agentId =
    (typeof context?.agentId === "string" && context.agentId.trim()) ||
    (typeof context?.agent?.id === "string" && context.agent.id.trim()) ||
    (typeof context?.webhookAgentId === "string" && context.webhookAgentId.trim()) ||
    (typeof args.agent_id === "string" && args.agent_id.trim()) ||
    "";
  return { userId, agentId, toolCallId };
}

export async function handleComputerToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  if (fn !== "start_computer_task" && fn !== "check_computer_task") {
    return null;
  }

  const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const { userId, agentId, toolCallId } = resolveComputerContextIds(context, record);

  if (!userId) {
    return {
      toolCallId,
      result:
        "COMPUTER_TASK_UNAVAILABLE: Missing workspace owner context (userId). The Cloud Computer action could not be run.",
    };
  }

  if (fn === "start_computer_task") {
    if (!agentId) {
      return {
        toolCallId,
        result:
          "COMPUTER_TASK_UNAVAILABLE: Missing Bot context (agentId). The Cloud Computer task could not be started.",
      };
    }
    const goal = typeof record.goal === "string" ? record.goal.trim() : "";
    const startUrl =
      typeof record.start_url === "string" && record.start_url.trim()
        ? record.start_url.trim()
        : typeof record.startUrl === "string" && record.startUrl.trim()
          ? record.startUrl.trim()
          : undefined;
    if (!goal) {
      return {
        toolCallId,
        result:
          "COMPUTER_TASK_INVALID: A non-empty goal is required to start a Cloud Computer task.",
      };
    }

    try {
      const task = await startComputerTask(userId, agentId, {
        goal,
        ...(startUrl ? { startUrl } : {}),
      });
      return {
        toolCallId,
        result: [
          `COMPUTER_TASK_STARTED: task_id=${task.id} status=${task.status}.`,
          `Goal: ${task.goal}`,
          ...(task.startUrl ? [`Start URL: ${task.startUrl}`] : []),
          "Acknowledge to the caller that you are checking this in your browser now, and use check_computer_task to read the live status or summary.",
        ].join(" "),
      };
    } catch (error) {
      const code = error instanceof AppError ? error.code : "COMPUTER_UNAVAILABLE";
      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Cloud Computer is unavailable right now.";
      return {
        toolCallId,
        result: `COMPUTER_TASK_UNAVAILABLE (${code}): ${message}`,
      };
    }
  }

  const requestedTaskId =
    typeof record.task_id === "string" && record.task_id.trim()
      ? record.task_id.trim()
      : typeof record.taskId === "string" && record.taskId.trim()
        ? record.taskId.trim()
        : "";

  try {
    const task = requestedTaskId
      ? await getComputerTaskForOwner(userId, requestedTaskId)
      : ((await listComputerTasksForOwner(userId, agentId || undefined))[0] ?? null);
    if (!task) {
      return {
        toolCallId,
        result:
          "COMPUTER_TASK_NONE: No running or recent Cloud Computer task was found for this Bot.",
      };
    }
    const parts = [
      `COMPUTER_TASK_STATUS: task_id=${task.id} status=${task.status}.`,
      `Goal: ${task.goal}`,
    ];
    if (task.summary) {
      parts.push(`Summary: ${task.summary}`);
    }
    if (task.question) {
      parts.push(`Pending question: ${task.question}`);
    }
    if (task.currentUrl) {
      parts.push(`Current URL: ${task.currentUrl}`);
    }
    if (task.errorCode) {
      parts.push(`Error code: ${task.errorCode}`);
    }
    return {
      toolCallId,
      result: parts.join(" "),
    };
  } catch (error) {
    const code = error instanceof AppError ? error.code : "COMPUTER_UNAVAILABLE";
    const message =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "Cloud Computer status is unavailable right now.";
    return {
      toolCallId,
      result: `COMPUTER_TASK_UNAVAILABLE (${code}): ${message}`,
    };
  }
}

async function dispatchToFirstAvailableHandler(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult> {
  const handlers = [
    // Native outbound calls carry a signed exact lead id. Resolve mutating
    // lead tools against that row before legacy phone-number fallback handlers.
    handleNativeVoiceToolCall,
    handleComputerToolCall,
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
  if (context.abortSignal?.aborted) {
    return {
      toolCallId: context.toolCallId,
      result: "This call no longer owns the live session, so the action was not run.",
    };
  }
  const computerResult = await handleComputerToolCall(fn, args, context);
  if (computerResult) {
    return enforceAgentToolResultTruth(fn, computerResult);
  }
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

  if (context.abortSignal?.aborted) {
    return {
      toolCallId: context.toolCallId,
      result: "This call no longer owns the live session, so the action was not run.",
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
    userId: input.userId,
    agentId: input.agentId,
    webhookAgentId: input.agentId,
    agentVoiceName: input.agentName || undefined,
    drizzle,
    log,
  };
}
