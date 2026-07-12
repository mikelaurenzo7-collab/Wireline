import express, { type NextFunction, type Request, type Response } from "express";

import { AppError } from "../lib/api-error";
import { authenticateUser } from "../middleware/auth";
import baseRouter from "./video-presenter-routes-base";

const router = express.Router();

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

router.use(baseRouter);

export default router;
