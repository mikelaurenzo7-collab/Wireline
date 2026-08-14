import express, { type NextFunction, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import { drizzle } from "../lib/server-context";
import { getLiveVideoUsageSnapshot } from "../lib/video-presenter/live-video-usage";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";
import baseRouter from "./video-presenter-routes-base";

const router = express.Router();
const liveVideoControlLimiter = createRateLimiter({
  bucket: "api:video-presenter-controls",
  windowMs: 60_000,
  max: 60,
});

/**
 * Catalog-presenter activation is an affirmative Account Holder action. The
 * client sends this acknowledgement only from the disclosed “Add live video”
 * control; direct API calls without it fail closed. Custom likeness submissions
 * continue through the separate pending-review consent workflow.
 *
 * Authenticate first so the disclosure gate runs behind the same default-deny
 * boundary as the underlying handler (authenticateUser is idempotent, so the
 * base router re-check below is a no-op).
 */
router.post(
  "/api/agents/:id/video-presenter/enable",
  authenticateUser,
  liveVideoControlLimiter,
  (req: Request, _res: Response, next: NextFunction) => {
    if (req.body?.consentAcknowledged !== true) {
      throw AppError.fromHttpStatus(
        400,
        "Confirm the live-video presenter disclosure before enabling this visual presence.",
      );
    }
    next();
  },
);

/**
 * Read the workspace's reserved Live Video allowance without starting a paid
 * provider session. Keeping this separate from session minting lets Studio show
 * the customer what another preview will cost before it reserves five minutes.
 */
router.get(
  "/api/video-presenter/usage",
  authenticateUser,
  liveVideoControlLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json(await getLiveVideoUsageSnapshot(req.user.id));
  },
);

/**
 * Turn Live Video off for one owned business agent without canceling the
 * workspace add-on or forgetting the chosen catalog face. Disabling is always
 * permitted — even when billing is past due — so a customer is never trapped
 * behind an entitlement gate while trying to reduce use.
 */
router.post(
  "/api/agents/:id/video-presenter/disable",
  authenticateUser,
  liveVideoControlLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const [updated] = await drizzle
      .update(schema.agents)
      .set({
        videoPresenterProvider: "synthetic",
        videoPresenterConsentStatus: "not_started",
      })
      .where(
        and(
          eq(schema.agents.id, req.params.id),
          eq(schema.agents.userId, req.user.id),
          eq(schema.agents.isBusinessAgent, true),
        ),
      )
      .returning({ id: schema.agents.id });

    if (!updated) throw AppError.fromHttpStatus(404, "Business agent not found");
    res.json({ disabled: true });
  },
);

router.use(baseRouter);

export default router;
