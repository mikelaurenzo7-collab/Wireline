import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { withAudit } from "../middleware/audit-middleware";
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
  // Metered, not capped — the same posture as the website-import sibling.
  // syncGoogleDriveToKnowledge issues one large model call per Drive document
  // (up to ten per request), and without an audit context recordUsage pushes
  // into an undefined AsyncLocalStorage store and drops every record: no
  // wireline_audit_log row, so the tenant's month-to-date AI spend, the spend
  // alerts, and margin reporting never saw a cent of it. Capping is still
  // deliberately omitted so an account holder is not stranded mid-onboarding.
  withAudit("workspace-knowledge"),
  async (req: AuthenticatedRequest, res) => {
    const agentId = typeof req.body?.agentId === "string" ? req.body.agentId.trim() : "";
    if (!agentId) throw AppError.fromHttpStatus(400, "agentId is required.");
    const [agent] = await drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
      .limit(1);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found.");
    res.json(await syncGoogleDriveToKnowledge(req.user.id, agentId));
  },
);
export default router;
