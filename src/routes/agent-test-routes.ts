import { Router, type Response } from "express";
import { z } from "zod";

import { AppError } from "../lib/api-error";
import { runStructuredStream } from "../lib/ai-structured";
import { isRuntimeAvailable } from "../lib/ai-client";
import { publicAiStreamFailureMessage } from "../lib/ai-stream-errors";
import { getErrorMessage } from "../lib/server-utils";
import { log } from "../lib/server-context";
import { authenticateEventStream } from "../middleware/auth";
import { claudeRateLimiter } from "../middleware/api-rate-limits";
import { enforceSpendCap } from "../lib/spend-guards";
import { withAudit } from "../middleware/audit-middleware";
import { validateBody } from "../lib/api-validation";
import type { AuthenticatedRequest } from "../types/auth";
import {
  PRIVATE_AGENT_TEST_TOOL,
  buildPrivateAgentTestUserMessage,
  loadPrivateAgentTestContext,
} from "../lib/private-agent-test";

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

router.post(
  "/api/agents/:id/test/stream",
  authenticateEventStream,
  claudeRateLimiter,
  // The test stream reaches a paid model. Respect the tenant's hard spend cap
  // and record its cost in auditLog.costUsd like every other AI surface, or the
  // simulation allowance is invisible COGS the spend guards cannot see.
  enforceSpendCap,
  withAudit("agent-test"),
  validateBody(customerTestMessageSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const customerMessage = req.body.content.trim();
      const history = req.body.history as Array<{ role: "customer" | "employee"; content: string }>;
      if (!isRuntimeAvailable()) throw AppError.fromHttpStatus(503, "AI runtime not configured");

      const context = await loadPrivateAgentTestContext(req.user.id, agentId);

      const { STRUCTURED_RUNTIME_MODELS } = await import("../lib/structured-runtime-models");
      const { createSseStream, writeSseBootstrap } = await import("../lib/sse-stream");
      const sse = createSseStream(req, res);
      writeSseBootstrap(sse, { agentId, agentName: context.agentName, mode: "customer_test" });

      try {
        const { result, thinking, thinkingDurationMs } = await runStructuredStream<{
          reply?: string;
        }>(
          {
            system: context.system,
            user: buildPrivateAgentTestUserMessage(context.agentName, customerMessage, history),
            tool: PRIVATE_AGENT_TEST_TOOL,
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
