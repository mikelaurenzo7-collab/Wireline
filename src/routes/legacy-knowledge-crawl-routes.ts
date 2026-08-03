import { Router, type Response } from "express";

import { jobsRateLimit } from "../middleware/api-rate-limits";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

/**
 * The original durable URL-crawl endpoint was never launch-certified and
 * remained hard-disabled. Keep an explicit authenticated tombstone ahead of
 * the legacy job router so old clients receive a permanent migration response
 * instead of the now-false claim that website knowledge is unavailable.
 */
router.post(
  "/api/jobs/knowledge-crawl",
  authenticateUser,
  jobsRateLimit,
  (_req: AuthenticatedRequest, res: Response) => {
    res.status(410).json({
      code: "GONE",
      error:
        "This legacy website-crawl endpoint has been retired. Import one public HTTPS page from the agent's Knowledge workspace instead.",
      replacement: "/api/agent-config/:agentId/website",
      scope: "single_public_https_page",
    });
  },
);

export default router;
