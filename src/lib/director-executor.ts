/**

 * Executes Director-approved actions and integration jobs through the

 * existing action engine, outbound dial path, and agent tool handlers.

 */

import { and, eq } from "drizzle-orm";

import { executeAction } from "./action-engine";

import type { ActionItem } from "./action-types";

import type { DirectorIntegrationJob, DirectorProposedAction } from "./director-Assistants-plan";

import type { WorkspaceActionKind } from "./workspace-planner";

import { getErrorMessage } from "./server-utils";

import { log, drizzle } from "./server-context";

import * as schema from "../db/schema";

import { resolveAgentTools } from "./agent-capabilities";

import { isDirectorIntegrationTool } from "./director-integration-tools";

import { buildDirectorToolContext, dispatchAgentToolCall } from "./agent-tool-dispatch";

import { buildDirectorToolArgs } from "./director-tool-args";

import { placeOutboundCall } from "./vapi-client";
import { assertOutboundVoiceAllowed } from "./voice-spend-control";

export interface DirectorExecutionResult {
  success: boolean;

  error?: string;

  /** Research / integration output surfaced back to the Account Holder. */

  output?: string;

  sources?: { title?: string; uri?: string }[];
}

const ACTION_ENGINE_TOOLS = new Set<string>(["send_slack_notification", "send_contract"]);

function mapCommsAction(action: DirectorProposedAction): ActionItem["type"] | null {
  switch (action.kind as WorkspaceActionKind) {
    case "send_email":
      return "send_email";

    case "send_text_message":
      return "send_text_message";

    default:
      return null;
  }
}

async function assertAgentCanUseTool(
  userId: string,

  agentId: string | undefined,

  tool: string,
): Promise<string | null> {
  if (!agentId) return "Select an agent in Coach so this runs with the right identity.";

  const [agentRow] = await drizzle

    .select({
      role: schema.agents.role,

      enabledTools: schema.agents.enabledTools,

      name: schema.agents.name,
    })

    .from(schema.agents)

    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))

    .limit(1);

  if (!agentRow) return "Agent not found.";

  const allowed = resolveAgentTools(agentRow.role ?? undefined, agentRow.enabledTools);

  if (!allowed.includes(tool as (typeof allowed)[number])) {
    return `Enable "${tool}" for ${agentRow.name || "this agent"} under Agents → Channels, then retry.`;
  }

  return null;
}

export async function executeDirectorCommsAction(
  userId: string,

  action: DirectorProposedAction,

  opts?: { hasExpressWrittenConsent?: boolean },
): Promise<DirectorExecutionResult> {
  if (action.kind === "make_call") {
    if (!action.to) return { success: false, error: "Phone number required" };

    if (!action.agentId) {
      return {
        success: false,

        error: "Pick an agent in Coach (or specify agent_id) — calls need a caller identity.",
      };
    }

    if (!opts?.hasExpressWrittenConsent) {
      return {
        success: false,

        error: "Confirm express written consent before placing outbound calls.",
      };
    }

    try {
      await assertOutboundVoiceAllowed({ userId, source: "director", units: 0 });
      const result = await placeOutboundCall({
        userId,

        agentId: action.agentId,

        customerName: action.customerName || "Customer",

        customerNumber: action.to,

        context: action.context || action.body || "Director-initiated call",
      });

      if (!result.ok) return { success: false, error: result.error || "Call failed" };

      const callId = result.callId ? ` (call ${result.callId})` : "";
      return {
        success: true,
        output:
          `Dial started to ${action.to}${callId}. ` +
          "Vapi accepted the call — track outcome, recording, and transcript under Phone → Call History once the call ends.",
      };
    } catch (e) {
      return { success: false, error: getErrorMessage(e) };
    }
  }

  const type = mapCommsAction(action);

  if (!type) return { success: false, error: "Unsupported comms action" };

  const gate = await assertAgentCanUseTool(userId, action.agentId, type);

  if (gate) return { success: false, error: gate };

  const item: ActionItem = {
    type,

    priority: "high",

    agentId: action.agentId,

    reasoning: "Director chat — Account Holder approved",

    payload:
      type === "send_email"
        ? { to: action.to, subject: action.subject || "Follow-up", body: action.body || "" }
        : { to: action.to, body: action.body || "" },
  };

  const result = await executeAction(
    userId,

    item,

    { sourceId: "director-chat", sourceType: "director_chat" },

    "auto",
  );

  return { success: result.success, error: result.error };
}

export async function executeDirectorIntegrationJob(
  userId: string,

  job: DirectorIntegrationJob,
): Promise<DirectorExecutionResult> {
  try {
    if (job.tool === "gemini_ground") {
      const query = (job.query || job.summary || "").trim();

      if (!query) return { success: false, error: "Research query required." };

      const { groundedSearch } = await import("./gemini-brain");

      const grounded = await groundedSearch(query);

      if (!grounded.answer?.trim()) {
        return { success: false, error: "Web research returned no results." };
      }

      const sourceTail =
        grounded.sources.length > 0
          ? `\n\nSources:\n${grounded.sources

              .slice(0, 5)

              .map((s, i) => `${i + 1}. ${s.title || "Source"}${s.uri ? ` — ${s.uri}` : ""}`)

              .join("\n")}`
          : "";

      return {
        success: true,

        output: grounded.answer + sourceTail,

        sources: grounded.sources,
      };
    }

    if (!isDirectorIntegrationTool(job.tool)) {
      return { success: false, error: `Unsupported integration tool: ${job.tool}` };
    }

    const gate = await assertAgentCanUseTool(userId, job.agentId, job.tool);

    if (gate) return { success: false, error: gate };

    if (ACTION_ENGINE_TOOLS.has(job.tool)) {
      if (job.tool === "send_slack_notification") {
        const result = await executeAction(
          userId,

          {
            type: "notify_slack",

            priority: "medium",

            agentId: job.agentId,

            reasoning: job.summary,

            payload: { message: job.query || job.summary },
          },

          { sourceId: "director-chat", sourceType: "director_chat" },

          "auto",
        );

        return {
          success: result.success,

          error: result.error,

          output: result.success ? "Slack notification sent." : undefined,
        };
      }

      if (job.tool === "send_contract") {
        const result = await executeAction(
          userId,

          {
            type: "send_contract",

            priority: "high",

            agentId: job.agentId,

            reasoning: job.summary,

            payload: { context: job.query || job.summary },
          },

          { sourceId: "director-chat", sourceType: "director_chat" },

          "auto",
        );

        return {
          success: result.success,

          error: result.error,

          output: result.success ? "DocuSign envelope sent." : undefined,
        };
      }
    }

    const agentId = job.agentId!;

    const [agentRow] = await drizzle

      .select({ name: schema.agents.name })

      .from(schema.agents)

      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))

      .limit(1);

    const args = buildDirectorToolArgs(job.tool, job);

    const context = buildDirectorToolContext({
      userId,

      agentId,

      agentName: agentRow?.name,
    });

    log.info("Director integration job — dispatching tool", { userId, tool: job.tool });

    const toolResult = await dispatchAgentToolCall(job.tool, args, context);

    const output = toolResult.result?.trim();

    if (!output) {
      return { success: false, error: "Integration returned no result." };
    }

    const failed = /isn't available|couldn't find|wasn't able|not connected|isn't set up/i.test(
      output,
    );

    return {
      success: !failed,

      output,

      error: failed ? output : undefined,
    };
  } catch (e) {
    return { success: false, error: getErrorMessage(e) };
  }
}
