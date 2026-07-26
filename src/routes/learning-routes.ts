import { Router, Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { approveLesson, rejectLesson, getLearningDigest } from "../lib/agent-learning-loop";
import { getErrorMessage } from "../lib/server-utils";
import { log } from "../lib/server-context";

const router = Router();
const limiter = createRateLimiter({ bucket: "api:agent-learning", windowMs: 60_000, max: 120 });

const reviewSchema = z.object({
  // BigInt(...) throws on non-numeric strings, which would surface as a 500.
  // Validate the shape here so bad input is rejected with a 400 instead.
  lesson_id: z.string().regex(/^\d+$/, "lesson_id must be a numeric string"),
  action: z.enum(["approve", "reject"]),
});

router.post(
  "/api/agents/lessons/review",
  authenticateUser,
  limiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, code: "BAD_REQUEST", error: "Invalid body" });
    }
    try {
      const lessonId = BigInt(parsed.data.lesson_id);
      const ok =
        parsed.data.action === "approve"
          ? await approveLesson(lessonId, req.user.id)
          : await rejectLesson(lessonId, req.user.id);
      return res.json({ ok });
    } catch (e: unknown) {
      log.error("lesson review failed", { error: getErrorMessage(e) });
      return res
        .status(500)
        .json({ ok: false, code: "INTERNAL_ERROR", error: "Lesson review failed" });
    }
  },
);

router.get(
  "/api/agents/:id/learning-digest",
  authenticateUser,
  limiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const digest = await getLearningDigest(req.user.id, req.params.id);
      return res.json({ ok: true, digest });
    } catch (e: unknown) {
      // Log the real error server-side; return a generic message so internal
      // details (query fragments, stack text) never reach the client.
      log.error("learning digest failed", { error: getErrorMessage(e) });
      return res
        .status(500)
        .json({ ok: false, code: "INTERNAL_ERROR", error: "Failed to load learning digest" });
    }
  },
);

export default router;
