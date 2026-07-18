import { Router } from "express";
import { isRuntimeAvailable } from "../lib/ai-client";
import { STRUCTURED_PRIMARY_MODEL } from "../lib/ai-models";
import { authenticateUser } from "../middleware/auth";

const router = Router();

router.get("/api/ai/status", authenticateUser, (_req, res) => {
  res.setHeader("Cache-Control", "private, max-age=30");
  res.json({
    available: isRuntimeAvailable(),
    primary_provider: "xai",
    primary_model: STRUCTURED_PRIMARY_MODEL,
  });
});

export default router;
