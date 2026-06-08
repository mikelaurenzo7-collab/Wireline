/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
import { Router, Response } from "express";
import { AppError } from "../lib/api-error";
import { log, auditLogger, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { syncGoogleDriveToKnowledge } from "../services/google-drive-sync";
import { claudeRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

router.post(
  "/api/drive/ingest",
  authenticateUser,
  claudeRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId: string = req.user.id;
    const { agentId } = req.body;
    if (!agentId || typeof agentId !== "string") {
      throw AppError.fromHttpStatus(400, "agentId is required.");
    }
    try {
      const [agent] = await drizzle
        .select({ id: schema.agents.id })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
        .limit(1);

      if (!agent) throw AppError.fromHttpStatus(404, "Agent not found.");

      const result = await syncGoogleDriveToKnowledge(userId, agentId);
      void auditLogger.logDataModification("settings.knowledge_base_updated", {
        userId,
        resource: "google_drive_ingest",
        metadata: result,
      });
      res.json(result);
    } catch (e: any) {
      log.error("Google Drive ingest failed", { userId, agentId, error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Drive knowledge ingest failed.");
    }
  },
);

export default router;
