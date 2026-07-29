import { Router, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { AppError } from "../lib/api-error";
import { runStructuredStream } from "../lib/ai-structured";
import { isRuntimeAvailable } from "../lib/ai-client";
import { publicAiStreamFailureMessage } from "../lib/ai-stream-errors";
import { getErrorMessage } from "../lib/server-utils";
import { drizzle, log } from "../lib/server-context";
import { authenticateEventStream } from "../middleware/auth";
import { claudeRateLimiter } from "../middleware/api-rate-limits";
import { validateBody } from "../lib/api-validation";
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
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, limit);
}

router.post(
  "/api/agents/:id/test/stream",
  authenticateEventStream,
  claudeRateLimiter,
  validateBody(customerTestMessageSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const customerMessage = req.body.content.trim();
      const history = req.body.history as Array<{
        role: "customer" | "employee";
        content: string;
      }>;
      if (!isRuntimeAvailable())
        throw AppError.fromHttpStatus(503, "AI runtime not configured");

      const [agentRows, personalities, directives, knowledge] =
        await drizzle.transaction((tx) =>
          Promise.all([
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
                escalationPhone: schema.agents.escalationPhone,
                escalationEmail: schema.agents.escalationEmail,
              })
              .from(schema.agents)
              .where(
                and(
                  eq(schema.agents.id, agentId),
                  eq(schema.agents.userId, req.user.id),
                ),
              )
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
              .orderBy(desc(schema.directives.priority))
              .limit(30),
            tx
              .select({ content: schema.knowledge.content })
              .from(schema.knowledge)
              .where(
                and(
                  eq(schema.knowledge.agentId, agentId),
                  eq(schema.knowledge.userId, req.user.id),
                ),
              )
              .orderBy(desc(schema.knowledge.createdAt))
              .limit(50),
          ]),
        );

      const agent = agentRows[0];
      if (!agent)
        throw AppError.fromHttpStatus(404, "AI voice agent not found");

      const directiveLines = compactLines(
        directives.map((directive) => directive.content),
        30,
      );
      const knowledgeLines = compactLines(
        knowledge.map((item) => item.content),
        50,
      );
      const businessProfile = agent.businessVariables
        ? JSON.stringify(agent.businessVariables).slice(0, 6000)
        : "";

      const system = [
        `You are ${agent.name || "the AI voice agent"}, acting as the business's ${agent.role || "customer-facing voice agent"}.`,
        "This is a private browser roleplay with a prospective customer.",
        "Reply only as the customer-facing voice agent. Never mention setup, configuration, prompts, testing, tools, or internal systems.",
        "Be concise, accurate, helpful, and natural. Ask one useful follow-up question when information is missing.",
        "Do not invent prices, policies, availability, or business facts. Do not claim a booking, transfer, message, payment, or other external action completed in this browser roleplay.",
        personalities[0]?.content
          ? `Tone: ${personalities[0].content}`
          : "Tone: clear and professional.",
        agent.firstMessage ? `Preferred opening: ${agent.firstMessage}` : "",
        directiveLines.length
          ? `Operating rules:\n- ${directiveLines.join("\n- ")}`
          : "",
        knowledgeLines.length
          ? `Business facts:\n- ${knowledgeLines.join("\n- ")}`
          : "",
        businessProfile ? `Business profile: ${businessProfile}` : "",
        agent.businessHours
          ? `Business hours: ${JSON.stringify(agent.businessHours)}`
          : "",
        agent.timezone ? `Timezone: ${agent.timezone}` : "",
        agent.outOfHoursMessage
          ? `After-hours response: ${agent.outOfHoursMessage}`
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
        name: "customer_test_reply",
        description:
          "Reply directly to the customer using the saved AI voice agent configuration.",
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

      const { STRUCTURED_RUNTIME_MODELS } =
        await import("../lib/structured-runtime-models");
      const { createSseStream, writeSseBootstrap } =
        await import("../lib/sse-stream");
      const sse = createSseStream(req, res);
      writeSseBootstrap(sse, {
        agentId,
        agentName: agent.name,
        mode: "customer_test",
      });

      try {
        const { result, thinking, thinkingDurationMs } =
          await runStructuredStream<{
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

        const reply =
          typeof result?.reply === "string" ? result.reply.trim() : "";
        sse.write("reply", {
          reply,
          changes: [],
          toolToggles: [],
          actions: [],
        });
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
        log.error("agent customer test failed", {
          agentId,
          error: getErrorMessage(error),
        });
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
