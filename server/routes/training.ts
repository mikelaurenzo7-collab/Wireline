import { Router, type Response } from "express";

import { authenticateUser, type AuthenticatedRequest } from "../lib/auth";
import { AppError, asyncHandler } from "../lib/errors";
import { getGeminiClient } from "../lib/gemini";
import { logger } from "../lib/logger";
import { db } from "../lib/supabase";

const router = Router();

router.post(
  "/api/train",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userMessage, agentId = "default-agent" } = req.body;
    const userId = req.user!.id;

    try {
      const { data: agent } = await db
        .from("wireline_agents")
        .select("id")
        .eq("id", agentId)
        .eq("user_id", userId)
        .single();
      if (!agent) {
        throw AppError.notFound("Agent not found");
      }

      const prompt = `
    You are the Wireline Configuration Engine. The business owner is training their AI fleet.
    Current Training Target: ${agentId}
    User Message: "${userMessage}"

    Task: Extract any new instructions, rules, or knowledge.
    Categorize them as:
    - DIRECTIVE: A hard rule the agent must follow (e.g. "Never give out personal cell numbers").
    - KNOWLEDGE: A fact about the business (e.g. "We are closed on Sundays").
    - PERSONALITY: A request regarding tone or style (e.g. "Be more enthusiastic and upbeat").

    Respond ONLY in strict, valid JSON format, without markdown wrapping:
    {
      "directives": [{"content": "...", "priority": 5}],
      "knowledge": [{"content": "..."}],
      "personality": "..."
    }
    `;

      const response = await getGeminiClient().models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });

      const parsed = JSON.parse(response.text || "{}");

      if (parsed.directives && parsed.directives.length) {
        await db
          .from("wireline_directives")
          .insert(
            parsed.directives.map((d: { content: string; priority: number }) => ({
              ...d,
              agent_id: agentId,
              user_id: userId,
            }))
          );
      }
      if (parsed.knowledge && parsed.knowledge.length) {
        await db
          .from("wireline_knowledge")
          .insert(
            parsed.knowledge.map((k: { content: string }) => ({
              ...k,
              agent_id: agentId,
              user_id: userId,
            }))
          );
      }
      if (parsed.personality) {
        await db
          .from("wireline_personality")
          .upsert({ agent_id: agentId, content: parsed.personality, user_id: userId });
      }

      res.json({ success: true, extracted: parsed });
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, "Training error");
      res.status(500).json({ error: "Failed to process training" });
    }
  })
);

export default router;
