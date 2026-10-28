import { resolveAgentGreeting } from "../lib/agent-greeting";
import { playbookPromptBlock } from "../lib/agent-playbook";
import { nativeCalendarRehearsalContext } from "../lib/native-calendar-rehearsal";
import { Router, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { AppError } from "../lib/api-error";
import { runStructuredStream } from "../lib/ai-structured";
import { isRuntimeAvailable } from "../lib/ai-client";
import { publicAiStreamFailureMessage } from "../lib/ai-stream-errors";
import { getErrorMessage } from "../lib/server-utils";
import { drizzle, log, serialQueryBatch } from "../lib/server-context";
import { DIRECTIVE_PROMPT_ORDER, loadPromptKnowledge } from "../lib/agent-knowledge-search";
import { privateTestConversationText } from "../lib/private-agent-test";
import { authenticateEventStream } from "../middleware/auth";
import { claudeRateLimiter } from "../middleware/api-rate-limits";
import { enforcePrivateTextSimulationSpendCap } from "../lib/spend-guards";
import { withAudit } from "../middleware/audit-middleware";
import { validateBody } from "../lib/api-validation";
import {
  isSavedRuntimeReviewRequired,
  RUNTIME_REVIEW_REQUIRED_RESPONSE,
} from "../lib/runtime-template-personality";
import { withoutStaleBotBoundPricing } from "../lib/usage-billing-catalog";
import type { AuthenticatedRequest } from "../types/auth";
import * as schema from "../db/schema";

const router = Router();

const customerTestMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["customer", "employee"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .max(12)
    .default([]),
});

function compactLines(values: Array<string | null | undefined>, limit: number) {
  return values
    .map((value) => withoutStaleBotBoundPricing(value?.trim() || ""))
    .filter((value): value is string => Boolean(value))
    .slice(0, limit);
}

router.post(
  "/api/agents/:id/test/stream",
  authenticateEventStream,
  claudeRateLimiter,
  // The test stream reaches a paid model. Respect the tenant's hard spend cap
  // and record its cost in auditLog.costUsd like every other AI surface, or the
  // simulation allowance is invisible COGS the spend guards cannot see.
  enforcePrivateTextSimulationSpendCap,
  withAudit("agent-test"),
  validateBody(customerTestMessageSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const customerMessage = req.body.content.trim();
      const history = req.body.history as Array<{ role: "customer" | "employee"; content: string }>;
      const [agentRows, personalities, directives] = await drizzle.transaction((tx) =>
        serialQueryBatch([
          tx
            .select({
              id: schema.agents.id,
              name: schema.agents.name,
              role: schema.agents.role,
              archetype: schema.agents.archetype,
              firstMessage: schema.agents.firstMessage,
              businessHours: schema.agents.businessHours,
              timezone: schema.agents.timezone,
              businessVariables: schema.agents.businessVariables,
              outOfHoursMessage: schema.agents.outOfHoursMessage,
              complianceMode: schema.agents.complianceMode,
              disallowedTopics: schema.agents.disallowedTopics,
              escalationKeywords: schema.agents.escalationKeywords,
              escalationPhone: schema.agents.escalationPhone,
              escalationEmail: schema.agents.escalationEmail,
              enabledTools: schema.agents.enabledTools,
              playbook: schema.agents.playbook,
            })
            .from(schema.agents)
            .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
            .limit(1),
          tx
            .select({ content: schema.personality.content })
            .from(schema.personality)
            .where(
              and(
                eq(schema.personality.agentId, agentId),
                eq(schema.personality.userId, req.user.id),
              ),
            )
            .limit(1),
          tx
            .select({ content: schema.directives.content })
            .from(schema.directives)
            .where(
              and(
                eq(schema.directives.agentId, agentId),
                eq(schema.directives.userId, req.user.id),
              ),
            )
            .orderBy(...DIRECTIVE_PROMPT_ORDER)
            .limit(30),
        ]),
      );

      const agent = agentRows[0];
      if (!agent) throw AppError.fromHttpStatus(404, "Bot not found");
      const storedPersonality = personalities[0]?.content || "";
      if (isSavedRuntimeReviewRequired(storedPersonality, agent.role)) {
        const { createSseStream, writeSseBootstrap } = await import("../lib/sse-stream");
        const sse = createSseStream(req, res);
        writeSseBootstrap(sse, { agentId, agentName: agent.name, mode: "customer_test" });
        const reply = RUNTIME_REVIEW_REQUIRED_RESPONSE;
        sse.write("reply", { reply, changes: [], toolToggles: [], actions: [] });
        sse.write("done", {
          reply,
          changes: [],
          toolToggles: [],
          actions: [],
          reasoning: "",
          thinkingDurationMs: 0,
        });
        sse.end();
        return;
      }
      const savedPersonality = withoutStaleBotBoundPricing(storedPersonality);
      if (!isRuntimeAvailable()) throw AppError.fromHttpStatus(503, "AI runtime not configured");

      const directiveLines = compactLines(
        directives.map((directive) => directive.content),
        30,
      );
      // Facts that answer what the customer said lead, then the newest.
      const knowledgeLines = compactLines(
        await loadPromptKnowledge(drizzle, {
          userId: req.user.id,
          agentId,
          text: privateTestConversationText(customerMessage, history),
          relevant: 12,
          total: 50,
        }),
        50,
      );
      const businessProfile = agent.businessVariables
        ? JSON.stringify(agent.businessVariables).slice(0, 6000)
        : "";
      const calendarContext = await nativeCalendarRehearsalContext(req.user.id, agent.enabledTools);
      const preferredOpening = withoutStaleBotBoundPricing(
        resolveAgentGreeting(agent, directives),
      );

      const system = [
        `You are ${agent.name || "the Bot"}, a customer-facing Bot configured for this role: ${agent.role || "general support"}.`,
        "This is a private browser roleplay with a prospective customer.",
        "Reply only as that customer-facing Bot. Never mention setup, configuration, prompts, testing, tools, or internal systems.",
        "Be concise, accurate, helpful, and natural. Ask one useful follow-up question when information is missing.",
        "Do not invent prices, policies, availability, or unprovided facts. Do not claim a booking, transfer, message, payment, or other external action completed in this browser roleplay.",
        calendarContext,
        savedPersonality ? `Tone: ${savedPersonality}` : "Tone: clear and professional.",
        preferredOpening ? `Preferred opening: ${preferredOpening}` : "",
        withoutStaleBotBoundPricing(playbookPromptBlock(agent.playbook)),
        directiveLines.length ? `Operating rules:\n- ${directiveLines.join("\n- ")}` : "",
        knowledgeLines.length ? `Knowledge facts:\n- ${knowledgeLines.join("\n- ")}` : "",
        businessProfile ? `Workspace profile: ${businessProfile}` : "",
        agent.businessHours ? `Operating hours: ${JSON.stringify(agent.businessHours)}` : "",
        agent.timezone ? `Timezone: ${agent.timezone}` : "",
        agent.outOfHoursMessage ? `After-hours response: ${agent.outOfHoursMessage}` : "",
        agent.complianceMode && agent.complianceMode !== "none"
          ? `Compliance mode: ${agent.complianceMode}.`
          : "",
        agent.disallowedTopics?.length
          ? `Do not discuss: ${agent.disallowedTopics.join(", ")}.`
          : "",
        agent.escalationKeywords?.length
          ? `Escalate or take a message when the caller raises: ${agent.escalationKeywords.join(", ")}.`
          : "",
        agent.escalationPhone || agent.escalationEmail
          ? `Human handoff contact: ${[agent.escalationPhone, agent.escalationEmail].filter(Boolean).join(" · ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const transcript = history
        .slice(-12)
        .map(
          (message) =>
            `${message.role === "customer" ? "Customer" : agent.name || "Agent"}: ${message.content}`,
        )
        .join("\n");
      const user = `${transcript ? `Conversation so far:\n${transcript}\n\n` : ""}Customer: ${customerMessage}`;

      const CUSTOMER_TEST_TOOL = {
        // This is a structured-output schema, not an executable agent tool.
        // The private test path never dispatches integrations or provider-side
        // actions; live tool boundaries retain their ordinary environment gate.
        name: "customer_test_reply",
        description: "Reply directly to the customer using the saved Bot configuration.",
        input_schema: {
          type: "object" as const,
          additionalProperties: false,
          properties: {
            reply: {
              type: "string",
              description: "Customer-facing reply, no more than 140 words.",
            },
          },
          required: ["reply"],
        },
      };

      const { STRUCTURED_RUNTIME_MODELS } = await import("../lib/structured-runtime-models");
      const { createSseStream, writeSseBootstrap } = await import("../lib/sse-stream");
      const sse = createSseStream(req, res);
      writeSseBootstrap(sse, { agentId, agentName: agent.name, mode: "customer_test" });

      try {
        const { result, thinking, thinkingDurationMs } = await runStructuredStream<{
          reply?: string;
        }>(
          {
            system,
            user,
            tool: CUSTOMER_TEST_TOOL,
            model: STRUCTURED_RUNTIME_MODELS.STANDARD,
            maxTokens: 900,
          },
          {
            onThinkingStart: () => sse.write("thinking_start", {}),
            onThinkingChunk: (text) => sse.write("thinking_chunk", { text }),
            onThinkingEnd: (fullText, durationMs) =>
              sse.write("thinking_end", { thinking: fullText, durationMs }),
            onResult: (result) => sse.write("reply", result),
          },
        );

        const reply = typeof result?.reply === "string" ? result.reply.trim() : "";
        if (!reply) throw new Error("The private rehearsal did not return a reply. Try again.");
        sse.write("reply", { reply, changes: [], toolToggles: [], actions: [] });
        sse.write("done", {
          reply,
          changes: [],
          toolToggles: [],
          actions: [],
          reasoning: thinking,
          thinkingDurationMs,
        });
        sse.end();
      } catch (error) {
        if (error instanceof AppError) throw error;
        log.error("agent customer test failed", { agentId, error: getErrorMessage(error) });
        sse.write("error", {
          message: publicAiStreamFailureMessage(
            error,
            "Could not generate the customer test response.",
          ),
        });
        sse.end();
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      const message = getErrorMessage(error);
      log.error("agent customer test setup failed", { error: message });
      if (!res.headersSent) {
        res.status(500).json({
          code: "INTERNAL_ERROR",
          error: "Could not start the customer test.",
          detail: message,
        });
      }
    }
  },
);

export default router;
