import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";
import { AppError } from "../lib/api-error";
import { drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { syncGoogleDriveToKnowledge } from "../services/google-drive-sync-v2";

const router = Router();
const limit = createIpRateLimiter({ bucket: "api:workspace-knowledge", windowMs: 60_000, max: 10 });
router.post(
  "/api/workspace-knowledge/google-drive",
  authenticateUser,
  limit,
  // Each document owns its atomic spend reservation and audit context.
  async (req: AuthenticatedRequest, res) => {
    const agentId = typeof req.body?.agentId === "string" ? req.body.agentId.trim() : "";
    if (!agentId) throw AppError.fromHttpStatus(400, "agentId is required.");
    const [agent] = await drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
      .limit(1);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found.");
    const result = await syncGoogleDriveToKnowledge(req.user.id, agentId);
    const { httpStatus = 200, ...body } = result;
    res.status(httpStatus).json(body);
  },
);
export default router;
