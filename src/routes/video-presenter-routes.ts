import express, { type NextFunction, type Request, type Response } from "express";

import { AppError } from "../lib/api-error";
import baseRouter from "./video-presenter-routes-base";

const router = express.Router();

/**
 * Catalog-presenter activation is an affirmative Account Holder action. The
 * client sends this acknowledgement only from the disclosed “Add live video”
 * control; direct API calls without it fail closed. Custom likeness submissions
 * continue through the separate pending-review consent workflow.
 */
router.post(
  "/api/agents/:id/video-presenter/enable",
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
