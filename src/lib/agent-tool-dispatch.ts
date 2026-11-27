/* eslint-disable @typescript-eslint/no-explicit-any */
/** Shared dispatch for live agent tools and Director-approved integration jobs. */

import { handleCalendarToolCall } from "./bot-tools/calendar";
import { handleCoreToolCall } from "./bot-tools/core";
import { handleDeviceToolCall } from "./bot-tools/device";
import { handleNotificationToolCall } from "./bot-tools/notifications";
import { handleResearchToolCall } from "./bot-tools/research";
import type { ToolCallContext, ToolCallResult } from "./agent-tool-types";
import { handleWorkflowToolCall } from "./bot-tools/workflow";
import { handleXToolCall } from "./bot-tools/x";
import { isAgentToolExecutionAuthorized } from "./agent-tool-authorization";
import { runIdempotentAgentToolCall } from "./agent-tool-idempotency";
import { handleNativeVoiceToolCall } from "./agent-tool-native-voice";
import { enforceAgentToolResultTruth } from "./agent-tool-result-truth";
import { AppError } from "./api-error";
import {
  dispatchGetComputerTaskForOwner,
  dispatchReplyComputerTaskForOwner,
  dispatchStartComputerTaskForOwner,
  dispatchStopComputerTaskForOwner,
} from "./cloud-computer/worker-client";

const COMPUTER_TOOL_NAMES = new Set([
  "start_computer_task",
  "check_computer_task",
  "reply_computer_task",
  "stop_computer_task",
]);

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
  if (!COMPUTER_TOOL_NAMES.has(fn)) {
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

  const callTaskIds = context.computerTaskIds;
  if (!callTaskIds) {
    return {
      toolCallId,
      result: "COMPUTER_TASK_UNAVAILABLE: The browser action requires a live call session.",
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
      const task = await dispatchStartComputerTaskForOwner(userId, agentId, {
        goal,
        ...(startUrl ? { startUrl } : {}),
      });
      if (task.agentId !== agentId) throw AppError.notFound("Task not found.");
      callTaskIds.add(task.id);
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
        : null;
  const targetTaskId = requestedTaskId ?? Array.from(callTaskIds).at(-1);
  if (!targetTaskId || !callTaskIds.has(targetTaskId)) {
    return {
      toolCallId,
      result:
        "COMPUTER_TASK_NONE: No Cloud Computer task started on this call matches the request.",
    };
  }

  if (fn === "reply_computer_task") {
    const message = typeof record.message === "string" ? record.message.trim() : "";
    if (!message) {
      return {
        toolCallId,
        result:
          "COMPUTER_TASK_INVALID: A non-empty message is required to reply to a paused Cloud Computer task.",
      };
    }
    try {
      const task = await dispatchReplyComputerTaskForOwner(userId, targetTaskId, message);
      return {
        toolCallId,
        result: [
          `COMPUTER_TASK_RESUMED: task_id=${task.id} status=${task.status}.`,
          `Goal: ${task.goal}`,
          "Your reply was sent to the browser task. Use check_computer_task to read the updated result.",
        ].join(" "),
      };
    } catch (error) {
      const code = error instanceof AppError ? error.code : "COMPUTER_UNAVAILABLE";
      const errMessage =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Cloud Computer reply could not be delivered.";
      return {
        toolCallId,
        result: `COMPUTER_TASK_UNAVAILABLE (${code}): ${errMessage}`,
      };
    }
  }

  if (fn === "stop_computer_task") {
    try {
      const task = await dispatchStopComputerTaskForOwner(userId, targetTaskId);
      return {
        toolCallId,
        result: `COMPUTER_TASK_STOPPED: task_id=${task.id} status=${task.status}. Goal: ${task.goal}`,
      };
    } catch (error) {
      const code = error instanceof AppError ? error.code : "COMPUTER_UNAVAILABLE";
      const errMessage =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Cloud Computer task could not be stopped.";
      return {
        toolCallId,
        result: `COMPUTER_TASK_UNAVAILABLE (${code}): ${errMessage}`,
      };
    }
  }

  try {
    const task = await dispatchGetComputerTaskForOwner(userId, targetTaskId);
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
    handleResearchToolCall,
    handleNotificationToolCall,
    handleXToolCall,
    handleWorkflowToolCall,
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
