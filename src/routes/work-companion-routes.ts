import { Router, type Response } from "express";

import { AppError, asyncHandler } from "../lib/api-error";
import { withAudit } from "../middleware/audit-middleware";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { enforceSpendCap } from "../lib/spend-guards";
import type { AuthenticatedRequest } from "../types/auth";
import {
  WORK_COMPANION_KINDS,
  applyWorkCompanionBrief,
  isWorkCompanionKind,
  runWorkCompanion,
  type WorkCompanionBrief,
} from "../lib/work-companion-runtime";
import { assertImagineVideoGenerationOffered } from "../lib/xai-imagine-video";

const router = Router();

const runRateLimit = createRateLimiter({
  bucket: "api:work-companions-run",
  windowMs: 60 * 60 * 1000,
  max: 20,
  failClosedOnError: true,
});

router.get(
  "/api/work-companions",
  authenticateUser,
  (_req: AuthenticatedRequest, res: Response) => {
    res.json({
      kinds: WORK_COMPANION_KINDS.map((kind) => ({
        id: kind,
        label: kind.replace(/_/g, " "),
      })),
      never: ["send_email", "dial", "enroll_campaign", "change_ads", "generate_video"],
      chat: false,
    });
  },
);

router.post(
  "/api/work-companions/runs",
  authenticateUser,
  enforceLaunchHardGate,
  runRateLimit,
  enforceSpendCap,
  withAudit("work_companions.run"),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const kind = req.body?.kind;
    const subject = typeof req.body?.subject === "string" ? req.body.subject : "";
    const context = typeof req.body?.context === "string" ? req.body.context : undefined;
    if (!isWorkCompanionKind(kind)) {
      throw AppError.fromHttpStatus(400, "Choose a prep kind.");
    }
    const brief = await runWorkCompanion({ kind, subject, context });
    res.json({ brief });
  }),
);

router.post(
  "/api/work-companions/video",
  authenticateUser,
  enforceLaunchHardGate,
  asyncHandler(async (_req: AuthenticatedRequest, _res: Response) => {
    assertImagineVideoGenerationOffered();
  }),
);

router.get(
  "/api/work-companions/video/:requestId",
  authenticateUser,
  asyncHandler(async (_req: AuthenticatedRequest, _res: Response) => {
    assertImagineVideoGenerationOffered();
  }),
);

router.post(
  "/api/work-companions/apply",
  authenticateUser,
  enforceLaunchHardGate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const kind = req.body?.brief?.kind;
    if (!isWorkCompanionKind(kind)) {
      throw AppError.fromHttpStatus(400, "Choose a prep kind.");
    }
    const brief = req.body?.brief as WorkCompanionBrief;
    const result = await applyWorkCompanionBrief({
      userId: req.user.id,
      agentId: typeof req.body?.agentId === "string" ? req.body.agentId : null,
      leadId: typeof req.body?.leadId === "string" ? req.body.leadId : null,
      customerNumber: typeof req.body?.customerNumber === "string" ? req.body.customerNumber : null,
      brief,
    });
    res.json(result);
  }),
);

export default router;
