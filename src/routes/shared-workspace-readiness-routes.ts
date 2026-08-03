import { Router } from "express";
import { authenticateUser } from "../middleware/auth";
import { requireCertifiedSharedWorkspaces } from "../lib/shared-workspace-readiness";

const router = Router();

// Mounted immediately before teamRouter. When certification is absent this is
// terminal for every /api/team surface; when present it authenticates once and
// falls through to the canonical team handlers.
router.use("/api/team", authenticateUser, requireCertifiedSharedWorkspaces);

export default router;
